-- AGNI-EYE spatial store. Lives in its own schema so `prisma db push` (which manages `public`) cannot drop it.
-- Requires the PostGIS extension (already enabled on the Neon project).
CREATE SCHEMA IF NOT EXISTS agni;

CREATE TABLE IF NOT EXISTS agni.industrial_site (
  id        text PRIMARY KEY,                       -- OSM ref, e.g. way/12345
  name      text,
  category  text NOT NULL,
  lat       double precision NOT NULL,
  lon       double precision NOT NULL,
  geom      geometry(Geometry, 4326) NOT NULL,      -- polygon for areas, point otherwise
  loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS industrial_site_geom_gix ON agni.industrial_site USING gist (geom);
CREATE INDEX IF NOT EXISTS industrial_site_category_ix ON agni.industrial_site (category);

CREATE TABLE IF NOT EXISTS agni.hotspot (
  id                   text PRIMARY KEY,
  source               text NOT NULL,
  acq_date             date NOT NULL,
  acq_time             text NOT NULL,               -- HHMM UTC
  lat                  double precision NOT NULL,
  lon                  double precision NOT NULL,
  geom                 geometry(Point, 4326) NOT NULL,
  frp                  real NOT NULL,
  brightness           real,
  bright_t31           real,
  day_night            char(1),
  detection_confidence text,                        -- satellite's own: low | nominal | high
  class                text NOT NULL,
  subtype              text,
  confidence           text NOT NULL,
  land_cover           text,
  site_id              text,
  site_name            text,
  site_category        text,
  site_distance_m      integer,
  days_active          integer,
  observed_days        integer,
  frp_median           real,
  frp_samples          integer,
  first_seen           date,
  last_seen            date,
  classifier_version   text NOT NULL,
  snapshot_generated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS hotspot_date_ix ON agni.hotspot (acq_date);
CREATE INDEX IF NOT EXISTS hotspot_class_ix ON agni.hotspot (class);
CREATE INDEX IF NOT EXISTS hotspot_geom_gix ON agni.hotspot USING gist (geom);

CREATE TABLE IF NOT EXISTS agni.persistent_source (
  id           text PRIMARY KEY,
  lat          double precision NOT NULL,
  lon          double precision NOT NULL,
  geom         geometry(Point, 4326) NOT NULL,
  class        text NOT NULL,
  subtype      text,
  confidence   text NOT NULL,
  site_name    text,
  site_category text,
  days_active  integer NOT NULL,
  window_days  integer NOT NULL,
  first_seen   date NOT NULL,
  last_seen    date NOT NULL,
  frp_median   real,
  frp_p90      real,
  last_frp     real,
  detections   integer,
  land_cover   text,
  latest_date  date NOT NULL,
  snapshot_generated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS persistent_source_geom_gix ON agni.persistent_source USING gist (geom);

-- Triage items are keyed by (day, ~555 m cell) so analyst decisions survive re-classification.
CREATE TABLE IF NOT EXISTS agni.triage_item (
  triage_key        text PRIMARY KEY,               -- "<acq_date>|<cellId>"
  hotspot_id        text NOT NULL,                  -- representative (strongest) detection
  class             text NOT NULL,
  confidence        text NOT NULL,
  priority          text NOT NULL CHECK (priority IN ('review', 'watch')),
  lat               double precision NOT NULL,
  lon               double precision NOT NULL,
  geom              geometry(Point, 4326) NOT NULL,
  acq_date          date NOT NULL,
  acq_time          text NOT NULL,
  frp               real NOT NULL,
  detections        integer NOT NULL,
  site_name         text,
  site_category     text,
  distance_m        integer,
  headline          text NOT NULL,
  score             real NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ack', 'dismissed')),
  status_updated_at timestamptz,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS triage_item_date_ix ON agni.triage_item (acq_date);
CREATE INDEX IF NOT EXISTS triage_item_status_ix ON agni.triage_item (status);

CREATE TABLE IF NOT EXISTS agni.snapshot_meta (
  id                 smallint PRIMARY KEY CHECK (id = 1),
  generated_at       timestamptz NOT NULL,
  latest_date        date NOT NULL,
  classifier_version text NOT NULL,
  observed_dates     jsonb NOT NULL,
  hotspot_dates      jsonb NOT NULL,
  counts             jsonb NOT NULL,
  layers             jsonb NOT NULL,
  loaded_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agni.ingest_run (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text NOT NULL DEFAULT 'running',
  rows        jsonb,
  detail      text
);
