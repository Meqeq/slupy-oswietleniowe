import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const client = new Client({
  user: "postgres",
  database: "postgres",
  hostname: "localhost",
  port: 5432,
});

await client.connect();

const loadObjects = async (takeSmallPart = true) => {
  if (takeSmallPart) {
    const envelope =
      "st_makeenvelope(4139149.4,165783.9,4140664.2,164921.7,2855)";

    await client.queryObject(
      "create table if not exists objects2(description varchar(50), geom geometry);"
    );

    await client.queryObject("truncate table objects2;");

    await client.queryObject(
      "insert into objects2 select descriptio, st_transform(geom, 2855) from roads;"
    );

    await client.queryObject(
      "create table if not exists objects(description varchar(50), geom geometry);"
    );

    await client.queryObject("truncate table objects;");

    await client.queryObject(
      `insert into objects select description, geom from objects2 where st_intersects(geom, ${envelope});`
    );

    await client.queryObject(
      "create table if not exists structures2(geom geometry);"
    );

    await client.queryObject("truncate table structures2;");

    await client.queryObject(
      `insert into structures2 select st_transform(geom, 2855) from structure_lines;`
    );

    await client.queryObject(
      "create table if not exists structures(geom geometry);"
    );

    await client.queryObject("truncate table structures;");

    await client.queryObject(
      `insert into structures select geom from structures2 where st_intersects(geom, ${envelope});`
    );
  } else {
    await client.queryObject(
      "create table if not exists objects(description varchar(50), geom geometry);"
    );

    await client.queryObject("truncate table objects;");

    await client.queryObject(
      "insert into objects select descriptio, st_transform(geom, 2855) from roads;"
    );
  }
};

const createRoadsContours = async (distanceFromRoad: number) => {
  await client.queryObject(
    "create table if not exists roadsContours(geom geometry);"
  );

  await client.queryObject("truncate table roadsContours;");

  await client.queryObject(
    `insert into roadsContours select
(st_dump(st_boundary(st_union(st_buffer(geom, ${distanceFromRoad}))))).geom
from objects
where description = 'Road' or description = 'Intersection';`
  );
};

const placePoles = async (poleSpacing: number) => {
  await client.queryObject(
    "create table if not exists initialPolesPlacement(geom geometry);"
  );

  await client.queryObject("truncate table initialPolesPlacement;");

  await client.queryObject(
    `insert into initialPolesPlacement select st_lineinterpolatepoints(geom, ${poleSpacing}/st_length(geom)) from roadsContours where st_length(geom) > ${poleSpacing};`
  );
};

const findIntersections = async (
  placeZoneSize: number,
  clearZoneSize: number
) => {
  await client.queryObject(
    "create table if not exists intersections(type varchar(50), geom geometry);"
  );

  await client.queryObject("truncate table intersections;");

  await client.queryObject(
    `insert into intersections select 'clearZone', st_union(st_buffer(geom, ${clearZoneSize})) from objects where description = 'Intersection';`
  );

  await client.queryObject(
    `insert into intersections select 'placeZone', st_union(st_buffer(geom, ${placeZoneSize})) from objects where description = 'Intersection';`
  );
};

const clearAndPlaceInIntersections = async () => {
  await client.queryObject(
    "create table if not exists polesAfterIntersections(geom geometry);"
  );

  await client.queryObject("truncate table polesAfterIntersections;");

  await client.queryObject(
    `insert into polesAfterIntersections select (st_dump(st_difference((select st_union(geom) from initialpolesplacement), (select st_union(geom) from intersections where type = 'clearZone')))).geom;`
  );

  await client.queryObject(
    `insert into polesAfterIntersections select st_intersection((select st_boundary(st_union(geom)) from intersections where type = 'placeZone'), (select st_union(geom) from roadsContours));`
  );
};

const clearObstacles = async (
  spacingForStructureLines: number,
  spacingForOther: number
) => {
  await client.queryObject(
    "create table if not exists clearedFromObstacles(geom geometry);"
  );
  await client.queryObject("truncate table clearedFromObstacles;");

  await client.queryObject(
    "create table if not exists obstacles(geom geometry);"
  );
  await client.queryObject("truncate table obstacles;");

  await client.queryObject("create table if not exists toMove(geom geometry);");
  await client.queryObject("truncate table toMove;");

  await client.queryObject(
    `insert into obstacles select st_buffer(st_union(geom), ${spacingForOther}) from objects where description != 'Road' and description != 'Intersection';`
  );

  await client.queryObject(
    `insert into obstacles select st_buffer(st_union(geom), ${spacingForStructureLines}) from structures;`
  );

  await client.queryObject(
    `insert into clearedFromObstacles select (st_dump(st_difference((select st_union(geom) from polesAfterIntersections), (select st_union(geom) from obstacles)))).geom;`
  );

  await client.queryObject(
    `insert into toMove select (st_dump(st_intersection((select st_union(geom) from polesAfterIntersections), (select st_union(geom) from obstacles)))).geom;`
  );
};

const movePolesAwayFromObstacles = async () => {
  await client.queryObject(
    "create table if not exists contoursWithoutObstacles(geom geometry);"
  );
  await client.queryObject("truncate table contoursWithoutObstacles;");

  await client.queryObject(
    "insert into contoursWithoutObstacles select st_difference((select st_union(geom) from roadscontours), (select st_union(geom) from obstacles));"
  );

  await client.queryObject(
    "create table if not exists movedPoints(geom geometry);"
  );
  await client.queryObject("truncate table movedPoints;");

  await client.queryObject(
    "insert into movedPoints select st_closestPoint((select geom from contoursWithoutObstacles), geom) from tomove;"
  );
};

const removeClosePoints = async (minLength: number) => {
  await client.queryObject(
    "create table if not exists finalPoles(geom geometry);"
  );
  await client.queryObject("truncate table finalPoles;");

  await client.queryObject(
    `insert into finalPoles select ST_RemoveRepeatedPoints(st_collect(geom), ${minLength}) from clearedFromObstacles;`
  );
};

try {
  await loadObjects();
  await createRoadsContours(1);
  await placePoles(30);
  await findIntersections(15, 30);
  await clearAndPlaceInIntersections();
  await clearObstacles(1, 3);
  await movePolesAwayFromObstacles();
  await removeClosePoints(10);
} catch (e) {
  console.log(e);
}

console.log("Zrobione");

await client.end();
