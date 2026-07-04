export interface CircuitMetadata {
  longestStraightM: number;
  lowSpeedCorners: number;
  medSpeedCorners: number;
  highSpeedCorners: number;
  powerWeight: number;      // % power importance
  downforceWeight: number;  // % downforce importance
  lat: number;
  lng: number;
}

const STATIC_METADATA: Record<string, Omit<CircuitMetadata, 'lat' | 'lng'>> = {
  monza: {
    longestStraightM: 1120,
    lowSpeedCorners: 2,
    medSpeedCorners: 4,
    highSpeedCorners: 5,
    powerWeight: 80,
    downforceWeight: 20,
  },
  monaco: {
    longestStraightM: 510,
    lowSpeedCorners: 12,
    medSpeedCorners: 5,
    highSpeedCorners: 2,
    powerWeight: 10,
    downforceWeight: 90,
  },
  spa: {
    longestStraightM: 770,
    lowSpeedCorners: 4,
    medSpeedCorners: 8,
    highSpeedCorners: 8,
    powerWeight: 60,
    downforceWeight: 40,
  },
};

const COORDINATES: Record<string, { lat: number; lng: number }> = {
  bahrain: { lat: 26.0325, lng: 50.5106 },
  jeddah: { lat: 21.6319, lng: 39.1044 },
  albert_park: { lat: -37.8497, lng: 144.968 },
  suzuka: { lat: 34.8431, lng: 136.541 },
  shanghai: { lat: 31.3389, lng: 121.22 },
  miami: { lat: 25.9581, lng: -80.2389 },
  imola: { lat: 44.3439, lng: 11.7167 },
  monaco: { lat: 43.7347, lng: 7.4206 },
  canada: { lat: 45.5005, lng: -73.5228 },
  catalunya: { lat: 41.57, lng: 2.2611 },
  red_bull_ring: { lat: 47.2197, lng: 14.7647 },
  silverstone: { lat: 52.0786, lng: -1.0169 },
  hungaroring: { lat: 47.5831, lng: 19.2511 },
  spa: { lat: 50.4372, lng: 5.9714 },
  zandvoort: { lat: 52.3888, lng: 4.5409 },
  monza: { lat: 45.6156, lng: 9.2811 },
  baku: { lat: 40.3725, lng: 49.8533 },
  singapore: { lat: 1.2914, lng: 103.864 },
  austin: { lat: 30.1328, lng: -97.6411 },
  mexico_city: { lat: 19.4042, lng: -99.0907 },
  interlagos: { lat: -23.7036, lng: -46.6997 },
  las_vegas: { lat: 36.1147, lng: -115.173 },
  lusail: { lat: 25.49, lng: 51.4542 },
  yas_marina: { lat: 24.4672, lng: 54.6031 },
};

export function getCircuitMetadata(
  key: string,
  lengthKm: number = 5,
  corners: number = 15
): CircuitMetadata {
  const coords = COORDINATES[key] || { lat: 0, lng: 0 };
  
  if (STATIC_METADATA[key]) {
    return {
      ...STATIC_METADATA[key],
      ...coords
    } as CircuitMetadata;
  }

  // Fallback generation based on track features
  const cornersCount = corners || 15;
  const length = lengthKm || 5;

  const lowSpeed = Math.floor(cornersCount * 0.35);
  const highSpeed = Math.floor(cornersCount * 0.25);
  const medSpeed = cornersCount - lowSpeed - highSpeed;

  // Longer tracks with fewer corners favor Power
  const density = cornersCount / length; // corners per km
  const powerWeight = Math.max(15, Math.min(85, Math.round(100 - (density * 15))));
  const downforceWeight = 100 - powerWeight;

  return {
    longestStraightM: Math.round(length * 180),
    lowSpeedCorners: lowSpeed,
    medSpeedCorners: medSpeed,
    highSpeedCorners: highSpeed,
    powerWeight,
    downforceWeight,
    ...coords
  };
}
