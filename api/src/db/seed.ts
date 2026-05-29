import { createDb } from '../config/database';
import { circuits, seasons } from './schema';

const CIRCUITS_2025 = [
  { circuitKey: 'bahrain',      name: 'Bahrain International Circuit',         country: 'Bahrain',      city: 'Sakhir',        lapCount: 57, trackLengthKm: '5.412', overtakeRate: '0.72' },
  { circuitKey: 'jeddah',       name: 'Jeddah Corniche Circuit',                country: 'Saudi Arabia', city: 'Jeddah',        lapCount: 50, trackLengthKm: '6.174', overtakeRate: '0.60' },
  { circuitKey: 'albert_park',  name: 'Albert Park Circuit',                    country: 'Australia',    city: 'Melbourne',     lapCount: 58, trackLengthKm: '5.278', overtakeRate: '0.50' },
  { circuitKey: 'suzuka',       name: 'Suzuka International Racing Course',     country: 'Japan',        city: 'Suzuka',        lapCount: 53, trackLengthKm: '5.807', overtakeRate: '0.35' },
  { circuitKey: 'shanghai',     name: 'Shanghai International Circuit',         country: 'China',        city: 'Shanghai',      lapCount: 56, trackLengthKm: '5.451', overtakeRate: '0.55' },
  { circuitKey: 'miami',        name: 'Miami International Autodrome',          country: 'USA',          city: 'Miami',         lapCount: 57, trackLengthKm: '5.412', overtakeRate: '0.65' },
  { circuitKey: 'imola',        name: 'Autodromo Enzo e Dino Ferrari',          country: 'Italy',        city: 'Imola',         lapCount: 63, trackLengthKm: '4.909', overtakeRate: '0.30' },
  { circuitKey: 'monaco',       name: 'Circuit de Monaco',                      country: 'Monaco',       city: 'Monte Carlo',   lapCount: 78, trackLengthKm: '3.337', overtakeRate: '0.05' },
  { circuitKey: 'canada',       name: 'Circuit Gilles Villeneuve',              country: 'Canada',       city: 'Montréal',      lapCount: 70, trackLengthKm: '4.361', overtakeRate: '0.65' },
  { circuitKey: 'catalunya',    name: 'Circuit de Barcelona-Catalunya',         country: 'Spain',        city: 'Barcelona',     lapCount: 66, trackLengthKm: '4.657', overtakeRate: '0.40' },
  { circuitKey: 'red_bull_ring',name: 'Red Bull Ring',                          country: 'Austria',      city: 'Spielberg',     lapCount: 71, trackLengthKm: '4.318', overtakeRate: '0.75' },
  { circuitKey: 'silverstone',  name: 'Silverstone Circuit',                    country: 'UK',           city: 'Silverstone',   lapCount: 52, trackLengthKm: '5.891', overtakeRate: '0.55' },
  { circuitKey: 'hungaroring',  name: 'Hungaroring',                            country: 'Hungary',      city: 'Budapest',      lapCount: 70, trackLengthKm: '4.381', overtakeRate: '0.25' },
  { circuitKey: 'spa',          name: 'Circuit de Spa-Francorchamps',           country: 'Belgium',      city: 'Spa',           lapCount: 44, trackLengthKm: '7.004', overtakeRate: '0.70' },
  { circuitKey: 'zandvoort',    name: 'Circuit Zandvoort',                      country: 'Netherlands',  city: 'Zandvoort',     lapCount: 72, trackLengthKm: '4.259', overtakeRate: '0.20' },
  { circuitKey: 'monza',        name: 'Autodromo Nazionale Monza',              country: 'Italy',        city: 'Monza',         lapCount: 53, trackLengthKm: '5.793', overtakeRate: '0.85' },
  { circuitKey: 'baku',         name: 'Baku City Circuit',                      country: 'Azerbaijan',   city: 'Baku',          lapCount: 51, trackLengthKm: '6.003', overtakeRate: '0.78' },
  { circuitKey: 'singapore',    name: 'Marina Bay Street Circuit',              country: 'Singapore',    city: 'Singapore',     lapCount: 62, trackLengthKm: '4.940', overtakeRate: '0.22' },
  { circuitKey: 'austin',       name: 'Circuit of the Americas',                country: 'USA',          city: 'Austin',        lapCount: 56, trackLengthKm: '5.513', overtakeRate: '0.68' },
  { circuitKey: 'mexico_city',  name: 'Autodromo Hermanos Rodriguez',           country: 'Mexico',       city: 'Mexico City',   lapCount: 71, trackLengthKm: '4.304', overtakeRate: '0.48' },
  { circuitKey: 'interlagos',   name: 'Autodromo Jose Carlos Pace',             country: 'Brazil',       city: 'Sao Paulo',     lapCount: 71, trackLengthKm: '4.309', overtakeRate: '0.65' },
  { circuitKey: 'las_vegas',    name: 'Las Vegas Strip Circuit',                country: 'USA',          city: 'Las Vegas',     lapCount: 50, trackLengthKm: '6.201', overtakeRate: '0.62' },
  { circuitKey: 'lusail',       name: 'Lusail International Circuit',           country: 'Qatar',        city: 'Lusail',        lapCount: 57, trackLengthKm: '5.380', overtakeRate: '0.58' },
  { circuitKey: 'yas_marina',   name: 'Yas Marina Circuit',                     country: 'UAE',          city: 'Abu Dhabi',     lapCount: 58, trackLengthKm: '5.281', overtakeRate: '0.55' },
  { circuitKey: 'portimao',     name: 'Autodromo Internacional do Algarve',     country: 'Portugal',     city: 'Portimao',      lapCount: 66, trackLengthKm: '4.653', overtakeRate: '0.45' },
  // Historical circuits (used in 2021-2022)
  { circuitKey: 'sochi',        name: 'Sochi Autodrom',                          country: 'Russia',       city: 'Sochi',         lapCount: 53, trackLengthKm: '5.848', overtakeRate: '0.55' },
  { circuitKey: 'istanbul',     name: 'Istanbul Park',                           country: 'Turkey',       city: 'Istanbul',      lapCount: 58, trackLengthKm: '5.338', overtakeRate: '0.60' },
  { circuitKey: 'paul_ricard',  name: 'Circuit Paul Ricard',                     country: 'France',       city: 'Le Castellet',  lapCount: 53, trackLengthKm: '5.842', overtakeRate: '0.45' },
  // 2026 new circuits
  { circuitKey: 'madrid',       name: 'IFEMA Madrid Circuit',                    country: 'Spain',        city: 'Madrid',        lapCount: 55, trackLengthKm: '5.473', overtakeRate: '0.52' },
  // 2018-2020 historical circuits
  { circuitKey: 'hockenheim',    name: 'Hockenheimring',                          country: 'Germany',      city: 'Hockenheim',     lapCount: 67, trackLengthKm: '4.574', overtakeRate: '0.55' },
  { circuitKey: 'nurburgring',   name: 'Nürburgring',                             country: 'Germany',      city: 'Nürburg',        lapCount: 60, trackLengthKm: '5.148', overtakeRate: '0.48' },
  { circuitKey: 'mugello',       name: 'Autodromo Internazionale del Mugello',    country: 'Italy',        city: 'Mugello',        lapCount: 59, trackLengthKm: '5.245', overtakeRate: '0.35' },
  // 2000-2017 historical circuits
  { circuitKey: 'sepang',        name: 'Sepang International Circuit',            country: 'Malaysia',     city: 'Kuala Lumpur',   lapCount: 56, trackLengthKm: '5.543', overtakeRate: '0.65' },
  { circuitKey: 'indianapolis',  name: 'Indianapolis Motor Speedway',             country: 'USA',          city: 'Indianapolis',   lapCount: 73, trackLengthKm: '4.192', overtakeRate: '0.80' },
  { circuitKey: 'magny_cours',   name: 'Circuit de Nevers Magny-Cours',           country: 'France',       city: 'Magny-Cours',    lapCount: 70, trackLengthKm: '4.411', overtakeRate: '0.30' },
  { circuitKey: 'a1_ring',       name: 'A1-Ring',                                 country: 'Austria',      city: 'Spielberg',      lapCount: 71, trackLengthKm: '4.326', overtakeRate: '0.70' },
  { circuitKey: 'valencia',      name: 'Valencia Street Circuit',                 country: 'Spain',        city: 'Valencia',       lapCount: 57, trackLengthKm: '5.419', overtakeRate: '0.35' },
  { circuitKey: 'korea',         name: 'Korean International Circuit',            country: 'South Korea',  city: 'Yeongam',        lapCount: 55, trackLengthKm: '5.615', overtakeRate: '0.50' },
  { circuitKey: 'india',         name: 'Buddh International Circuit',             country: 'India',        city: 'Greater Noida',  lapCount: 60, trackLengthKm: '5.125', overtakeRate: '0.55' },
  { circuitKey: 'bahrain_outer', name: 'Bahrain International Circuit (Outer)',   country: 'Bahrain',      city: 'Sakhir',         lapCount: 87, trackLengthKm: '3.543', overtakeRate: '0.90' },
  { circuitKey: 'fuji_speedway', name: 'Fuji Speedway',                           country: 'Japan',        city: 'Oyama',          lapCount: 67, trackLengthKm: '4.563', overtakeRate: '0.60' },
];

async function seed() {
  const db = createDb(process.env.DATABASE_URL!);

  console.log('Seeding seasons...');
  await db.insert(seasons).values([
    { year: 2000 }, { year: 2001 }, { year: 2002 }, { year: 2003 }, { year: 2004 },
    { year: 2005 }, { year: 2006 }, { year: 2007 }, { year: 2008 }, { year: 2009 },
    { year: 2010 }, { year: 2011 }, { year: 2012 }, { year: 2013 }, { year: 2014 },
    { year: 2015 }, { year: 2016 }, { year: 2017 },
    { year: 2018 },
    { year: 2019 },
    { year: 2020 },
    { year: 2021 },
    { year: 2022 },
    { year: 2023 },
    { year: 2024 },
    { year: 2025 },
    { year: 2026 },
  ]).onConflictDoNothing();

  console.log('Seeding circuits...');
  await db.insert(circuits).values(CIRCUITS_2025).onConflictDoNothing();

  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
