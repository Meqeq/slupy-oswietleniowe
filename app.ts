import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const client = new Client({
  user: "postgres",
  database: "postgres",
  hostname: "localhost",
  port: 5432,
});

await client.connect();

try {
  // await client.queryObject("DROP TABLE result, result2, result3, result4;");
  await client.queryObject(
    "truncate table result, result2, result3, result4, result5;"
  );
  // await client.queryObject(
  //   "create table result(description varchar(50), geom geometry);"
  // );

  // await client.queryObject("create table result2(geom geometry);");

  // await client.queryObject("create table result3(geom geometry);");

  // await client.queryObject("create table result4(geom geometry);");

  // await client.queryObject(
  //   "create table result5(type varchar(50), geom geometry);"
  // );

  await client.queryObject(
    "insert into result select descriptio, st_transform(geom, 2855) from roads;"
  );

  await client.queryObject(
    "insert into result2 select st_boundary(st_union(st_buffer(geom, 1))) from result where description = 'Road' or description = 'Intersection';"
  );

  await client.queryObject(
    "insert into result3 select (st_dump(geom)).geom  from result2;"
  );

  const poleSpacing = 50;

  await client.queryObject(
    `insert into result4 select st_lineinterpolatepoints(geom, ${poleSpacing}/st_length(geom)) from result3 where st_length(geom) > ${poleSpacing};`
  );

  await client.queryObject(
    `insert into result5 select 'clearPolesIntersections', st_union(st_buffer(geom, 20)) from result where description = 'Intersection';`
  );

  await client.queryObject(
    `insert into result5 select 'placePolesIntersections', st_union(st_buffer(geom, 15)) from result where description = 'Intersection';`
  );

  await client.queryObject(
    `insert into result5 select 'obstacle', st_buffer(st_union(geom), 3) from result where description != 'Road' and description != 'Intersection';`
  );

  await client.queryObject(
    `delete from result4 where st_contains((select geom from result5 where type = 'clearPolesIntersections'), geom);`
  );

  await client.queryObject(
    `delete from result4 where st_contains((select geom from result5 where type = 'obstacles'), geom);`
  );

  /* await client.queryObject(
    `insert into result4 select st_intersection((select st_boundary(geom) from result5 where type='placePolesIntersections'), (select geom from result2));`
  ); */
} catch (e) {
  console.log(e);
}

console.log("Zrobione");

await client.end();
