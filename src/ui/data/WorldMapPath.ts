/**
 * Simplified continent outlines for ground track map.
 * Equirectangular projection: x = lon + 180, y = 90 - lat.
 * ViewBox: 0 0 360 180.
 */

export const CONTINENT_PATHS: string[] = [
  // North America
  'M 30,30 L 40,25 55,28 70,25 85,30 95,35 100,45 105,55 98,60 100,65 90,68 85,62 75,65 65,58 55,60 45,55 35,50 28,40 Z',
  // South America
  'M 85,72 L 92,70 100,75 102,85 105,95 103,110 95,120 88,128 82,120 78,110 75,100 78,88 82,78 Z',
  // Europe
  'M 170,25 L 175,22 185,24 195,28 200,32 195,38 190,42 185,45 178,42 172,38 168,32 Z',
  // Africa
  'M 170,48 L 180,45 190,48 200,55 205,65 202,78 198,90 190,100 180,105 172,100 168,90 165,78 162,65 165,55 Z',
  // Asia
  'M 200,20 L 215,18 230,15 245,18 260,20 275,25 285,30 295,32 300,40 295,48 285,52 275,50 265,48 255,55 245,52 235,48 225,50 215,45 205,40 200,32 Z',
  // India/SE Asia
  'M 245,55 L 255,52 260,58 258,68 252,72 245,68 240,62 Z',
  // Indonesia
  'M 265,68 L 275,66 285,68 295,70 290,74 280,73 270,72 Z',
  // Australia
  'M 280,95 L 295,90 310,92 315,100 312,110 305,115 292,115 282,110 278,102 Z',
  // Japan/Korea
  'M 300,30 L 305,28 308,32 306,38 302,36 Z',
  // UK/Iceland
  'M 168,26 L 172,24 174,28 170,30 Z',
  'M 155,20 L 160,18 162,22 158,24 Z',
  // Greenland
  'M 100,10 L 115,8 125,12 120,20 110,22 102,18 Z',
];

export const GROUND_STATIONS: Array<{ name: string; lon: number; lat: number }> = [
  { name: 'Houston', lon: -95.4, lat: 29.8 },
  { name: 'Madrid', lon: -3.7, lat: 40.4 },
  { name: 'Canberra', lon: 149.1, lat: -35.3 },
  { name: 'Goldstone', lon: -116.9, lat: 35.4 },
  { name: 'Wallops', lon: -75.5, lat: 37.9 },
];
