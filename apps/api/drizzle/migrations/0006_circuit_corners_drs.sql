ALTER TABLE "circuits" ADD COLUMN "number_of_corners" integer;--> statement-breakpoint
ALTER TABLE "circuits" ADD COLUMN "drs_zones" integer;--> statement-breakpoint
UPDATE "circuits" SET
  "number_of_corners" = CASE "circuit_key"
    WHEN 'bahrain'       THEN 15
    WHEN 'jeddah'        THEN 27
    WHEN 'albert_park'   THEN 16
    WHEN 'suzuka'        THEN 18
    WHEN 'shanghai'      THEN 16
    WHEN 'miami'         THEN 19
    WHEN 'imola'         THEN 21
    WHEN 'monaco'        THEN 19
    WHEN 'canada'        THEN 14
    WHEN 'catalunya'     THEN 14
    WHEN 'red_bull_ring' THEN 10
    WHEN 'silverstone'   THEN 18
    WHEN 'hungaroring'   THEN 14
    WHEN 'spa'           THEN 19
    WHEN 'zandvoort'     THEN 14
    WHEN 'monza'         THEN 11
    WHEN 'baku'          THEN 20
    WHEN 'singapore'     THEN 23
    WHEN 'austin'        THEN 20
    WHEN 'mexico_city'   THEN 17
    WHEN 'interlagos'    THEN 15
    WHEN 'las_vegas'     THEN 17
    WHEN 'lusail'        THEN 16
    WHEN 'yas_marina'    THEN 16
    WHEN 'portimao'      THEN 15
    WHEN 'sochi'         THEN 18
    WHEN 'istanbul'      THEN 14
    WHEN 'paul_ricard'   THEN 15
    WHEN 'madrid'        THEN 20
    WHEN 'hockenheim'    THEN 17
    WHEN 'nurburgring'   THEN 15
    WHEN 'mugello'       THEN 15
    WHEN 'sepang'        THEN 15
    WHEN 'indianapolis'  THEN 13
    WHEN 'magny_cours'   THEN 17
    WHEN 'a1_ring'       THEN  9
    WHEN 'valencia'      THEN 25
    WHEN 'korea'         THEN 18
    WHEN 'india'         THEN 16
    WHEN 'bahrain_outer' THEN 11
    WHEN 'fuji_speedway' THEN 16
    ELSE NULL
  END,
  "drs_zones" = CASE "circuit_key"
    WHEN 'bahrain'       THEN 3
    WHEN 'jeddah'        THEN 3
    WHEN 'albert_park'   THEN 4
    WHEN 'suzuka'        THEN 2
    WHEN 'shanghai'      THEN 2
    WHEN 'miami'         THEN 3
    WHEN 'imola'         THEN 2
    WHEN 'monaco'        THEN 1
    WHEN 'canada'        THEN 2
    WHEN 'catalunya'     THEN 2
    WHEN 'red_bull_ring' THEN 3
    WHEN 'silverstone'   THEN 2
    WHEN 'hungaroring'   THEN 1
    WHEN 'spa'           THEN 2
    WHEN 'zandvoort'     THEN 2
    WHEN 'monza'         THEN 2
    WHEN 'baku'          THEN 2
    WHEN 'singapore'     THEN 3
    WHEN 'austin'        THEN 2
    WHEN 'mexico_city'   THEN 3
    WHEN 'interlagos'    THEN 2
    WHEN 'las_vegas'     THEN 2
    WHEN 'lusail'        THEN 3
    WHEN 'yas_marina'    THEN 2
    WHEN 'portimao'      THEN 3
    WHEN 'sochi'         THEN 2
    WHEN 'istanbul'      THEN 2
    WHEN 'paul_ricard'   THEN 2
    WHEN 'madrid'        THEN 3
    WHEN 'hockenheim'    THEN 3
    WHEN 'nurburgring'   THEN 3
    WHEN 'mugello'       THEN 3
    WHEN 'sepang'        THEN 3
    WHEN 'valencia'      THEN 2
    WHEN 'korea'         THEN 3
    WHEN 'india'         THEN 3
    WHEN 'bahrain_outer' THEN 4
    -- indianapolis, magny_cours, a1_ring, fuji_speedway: pre-DRS era → NULL
    ELSE NULL
  END;
