/**
 * The geography dataset every geo game and quiz in maNOWj PLAY runs on.
 *
 * It is bundled rather than fetched on purpose: a game must start instantly
 * and must not break when a free API rate-limits you mid-round. Nothing here
 * is generated or approximated beyond what's stated — capital coordinates are
 * the capital city's own position (good to about a kilometre, which is far
 * inside the scoring bands a pin game uses), and flag emoji are derived from
 * the ISO 3166-1 alpha-2 code rather than stored, so they can't drift out of
 * step with the code.
 */

export interface Country {
  /** ISO 3166-1 alpha-2. Also the source of the flag emoji. */
  code: string;
  name: string;
  capital: string;
  /** Capital city coordinates. */
  lat: number;
  lon: number;
  region: Region;
}

export type Region = "Africa" | "Americas" | "Asia" | "Europe" | "Oceania";

/**
 * Where to find a country's flag image.
 *
 * This replaced flagEmoji(), which built the flag from two Regional Indicator
 * Symbols — "IN" becomes U+1F1EE U+1F1F3 — and relied on the font to compose
 * them into one glyph. Elegant, free, and broken on Windows, which ships no
 * flag glyphs whatsoever: every flag rendered as its two ISO letters. The Flag
 * Quiz therefore displayed "KZ" above "Which country's flag is this?".
 *
 * The images are generated into public/flags by scripts/build-flags.mjs from
 * the flag-icons SVG set, and served from this origin — the site's CSP allows
 * images from 'self' only, so a CDN was never an option.
 *
 * Every code in COUNTRIES below has a file; tests/unit/flags.test.ts fails the
 * build if one is ever missing, because a country with no flag renders as a
 * broken image in the middle of a game.
 */
export function flagSrc(code: string): string {
  return `/flags/${code.toLowerCase()}.png`;
}

export const COUNTRIES: Country[] = [
  // --- Asia ---
  { code: "IN", name: "India", capital: "New Delhi", lat: 28.6139, lon: 77.209, region: "Asia" },
  { code: "CN", name: "China", capital: "Beijing", lat: 39.9042, lon: 116.4074, region: "Asia" },
  { code: "JP", name: "Japan", capital: "Tokyo", lat: 35.6762, lon: 139.6503, region: "Asia" },
  { code: "KR", name: "South Korea", capital: "Seoul", lat: 37.5665, lon: 126.978, region: "Asia" },
  { code: "ID", name: "Indonesia", capital: "Jakarta", lat: -6.2088, lon: 106.8456, region: "Asia" },
  { code: "PK", name: "Pakistan", capital: "Islamabad", lat: 33.6844, lon: 73.0479, region: "Asia" },
  { code: "BD", name: "Bangladesh", capital: "Dhaka", lat: 23.8103, lon: 90.4125, region: "Asia" },
  { code: "LK", name: "Sri Lanka", capital: "Colombo", lat: 6.9271, lon: 79.8612, region: "Asia" },
  { code: "NP", name: "Nepal", capital: "Kathmandu", lat: 27.7172, lon: 85.324, region: "Asia" },
  { code: "TH", name: "Thailand", capital: "Bangkok", lat: 13.7563, lon: 100.5018, region: "Asia" },
  { code: "VN", name: "Vietnam", capital: "Hanoi", lat: 21.0278, lon: 105.8342, region: "Asia" },
  { code: "MY", name: "Malaysia", capital: "Kuala Lumpur", lat: 3.139, lon: 101.6869, region: "Asia" },
  { code: "SG", name: "Singapore", capital: "Singapore", lat: 1.3521, lon: 103.8198, region: "Asia" },
  { code: "PH", name: "Philippines", capital: "Manila", lat: 14.5995, lon: 120.9842, region: "Asia" },
  { code: "MM", name: "Myanmar", capital: "Naypyidaw", lat: 19.7633, lon: 96.0785, region: "Asia" },
  { code: "KH", name: "Cambodia", capital: "Phnom Penh", lat: 11.5564, lon: 104.9282, region: "Asia" },
  { code: "AF", name: "Afghanistan", capital: "Kabul", lat: 34.5553, lon: 69.2075, region: "Asia" },
  { code: "IR", name: "Iran", capital: "Tehran", lat: 35.6892, lon: 51.389, region: "Asia" },
  { code: "IQ", name: "Iraq", capital: "Baghdad", lat: 33.3152, lon: 44.3661, region: "Asia" },
  { code: "SA", name: "Saudi Arabia", capital: "Riyadh", lat: 24.7136, lon: 46.6753, region: "Asia" },
  { code: "AE", name: "United Arab Emirates", capital: "Abu Dhabi", lat: 24.4539, lon: 54.3773, region: "Asia" },
  { code: "QA", name: "Qatar", capital: "Doha", lat: 25.2854, lon: 51.531, region: "Asia" },
  { code: "KW", name: "Kuwait", capital: "Kuwait City", lat: 29.3759, lon: 47.9774, region: "Asia" },
  { code: "OM", name: "Oman", capital: "Muscat", lat: 23.588, lon: 58.3829, region: "Asia" },
  { code: "IL", name: "Israel", capital: "Jerusalem", lat: 31.7683, lon: 35.2137, region: "Asia" },
  { code: "JO", name: "Jordan", capital: "Amman", lat: 31.9454, lon: 35.9284, region: "Asia" },
  { code: "LB", name: "Lebanon", capital: "Beirut", lat: 33.8938, lon: 35.5018, region: "Asia" },
  { code: "SY", name: "Syria", capital: "Damascus", lat: 33.5138, lon: 36.2765, region: "Asia" },
  { code: "TR", name: "Türkiye", capital: "Ankara", lat: 39.9334, lon: 32.8597, region: "Asia" },
  { code: "KZ", name: "Kazakhstan", capital: "Astana", lat: 51.1694, lon: 71.4491, region: "Asia" },
  { code: "UZ", name: "Uzbekistan", capital: "Tashkent", lat: 41.2995, lon: 69.2401, region: "Asia" },
  { code: "MN", name: "Mongolia", capital: "Ulaanbaatar", lat: 47.8864, lon: 106.9057, region: "Asia" },
  { code: "BT", name: "Bhutan", capital: "Thimphu", lat: 27.4728, lon: 89.639, region: "Asia" },
  { code: "MV", name: "Maldives", capital: "Malé", lat: 4.1755, lon: 73.5093, region: "Asia" },

  // --- Europe ---
  { code: "GB", name: "United Kingdom", capital: "London", lat: 51.5074, lon: -0.1278, region: "Europe" },
  { code: "FR", name: "France", capital: "Paris", lat: 48.8566, lon: 2.3522, region: "Europe" },
  { code: "DE", name: "Germany", capital: "Berlin", lat: 52.52, lon: 13.405, region: "Europe" },
  { code: "IT", name: "Italy", capital: "Rome", lat: 41.9028, lon: 12.4964, region: "Europe" },
  { code: "ES", name: "Spain", capital: "Madrid", lat: 40.4168, lon: -3.7038, region: "Europe" },
  { code: "PT", name: "Portugal", capital: "Lisbon", lat: 38.7223, lon: -9.1393, region: "Europe" },
  { code: "NL", name: "Netherlands", capital: "Amsterdam", lat: 52.3676, lon: 4.9041, region: "Europe" },
  { code: "BE", name: "Belgium", capital: "Brussels", lat: 50.8503, lon: 4.3517, region: "Europe" },
  { code: "CH", name: "Switzerland", capital: "Bern", lat: 46.948, lon: 7.4474, region: "Europe" },
  { code: "AT", name: "Austria", capital: "Vienna", lat: 48.2082, lon: 16.3738, region: "Europe" },
  { code: "SE", name: "Sweden", capital: "Stockholm", lat: 59.3293, lon: 18.0686, region: "Europe" },
  { code: "NO", name: "Norway", capital: "Oslo", lat: 59.9139, lon: 10.7522, region: "Europe" },
  { code: "DK", name: "Denmark", capital: "Copenhagen", lat: 55.6761, lon: 12.5683, region: "Europe" },
  { code: "FI", name: "Finland", capital: "Helsinki", lat: 60.1699, lon: 24.9384, region: "Europe" },
  { code: "IE", name: "Ireland", capital: "Dublin", lat: 53.3498, lon: -6.2603, region: "Europe" },
  { code: "PL", name: "Poland", capital: "Warsaw", lat: 52.2297, lon: 21.0122, region: "Europe" },
  { code: "CZ", name: "Czechia", capital: "Prague", lat: 50.0755, lon: 14.4378, region: "Europe" },
  { code: "HU", name: "Hungary", capital: "Budapest", lat: 47.4979, lon: 19.0402, region: "Europe" },
  { code: "GR", name: "Greece", capital: "Athens", lat: 37.9838, lon: 23.7275, region: "Europe" },
  { code: "RO", name: "Romania", capital: "Bucharest", lat: 44.4268, lon: 26.1025, region: "Europe" },
  { code: "BG", name: "Bulgaria", capital: "Sofia", lat: 42.6977, lon: 23.3219, region: "Europe" },
  { code: "RS", name: "Serbia", capital: "Belgrade", lat: 44.7866, lon: 20.4489, region: "Europe" },
  { code: "HR", name: "Croatia", capital: "Zagreb", lat: 45.815, lon: 15.9819, region: "Europe" },
  { code: "UA", name: "Ukraine", capital: "Kyiv", lat: 50.4501, lon: 30.5234, region: "Europe" },
  { code: "RU", name: "Russia", capital: "Moscow", lat: 55.7558, lon: 37.6173, region: "Europe" },
  { code: "IS", name: "Iceland", capital: "Reykjavík", lat: 64.1466, lon: -21.9426, region: "Europe" },

  // --- Africa ---
  { code: "EG", name: "Egypt", capital: "Cairo", lat: 30.0444, lon: 31.2357, region: "Africa" },
  { code: "NG", name: "Nigeria", capital: "Abuja", lat: 9.0765, lon: 7.3986, region: "Africa" },
  { code: "ZA", name: "South Africa", capital: "Pretoria", lat: -25.7479, lon: 28.2293, region: "Africa" },
  { code: "KE", name: "Kenya", capital: "Nairobi", lat: -1.2921, lon: 36.8219, region: "Africa" },
  { code: "ET", name: "Ethiopia", capital: "Addis Ababa", lat: 9.032, lon: 38.7469, region: "Africa" },
  { code: "TZ", name: "Tanzania", capital: "Dodoma", lat: -6.163, lon: 35.7516, region: "Africa" },
  { code: "UG", name: "Uganda", capital: "Kampala", lat: 0.3476, lon: 32.5825, region: "Africa" },
  { code: "GH", name: "Ghana", capital: "Accra", lat: 5.6037, lon: -0.187, region: "Africa" },
  { code: "MA", name: "Morocco", capital: "Rabat", lat: 34.0209, lon: -6.8416, region: "Africa" },
  { code: "DZ", name: "Algeria", capital: "Algiers", lat: 36.7538, lon: 3.0588, region: "Africa" },
  { code: "TN", name: "Tunisia", capital: "Tunis", lat: 36.8065, lon: 10.1815, region: "Africa" },
  { code: "SN", name: "Senegal", capital: "Dakar", lat: 14.7167, lon: -17.4677, region: "Africa" },
  { code: "ZW", name: "Zimbabwe", capital: "Harare", lat: -17.8252, lon: 31.0335, region: "Africa" },
  { code: "ZM", name: "Zambia", capital: "Lusaka", lat: -15.3875, lon: 28.3228, region: "Africa" },
  { code: "MZ", name: "Mozambique", capital: "Maputo", lat: -25.9692, lon: 32.5732, region: "Africa" },
  { code: "MU", name: "Mauritius", capital: "Port Louis", lat: -20.1609, lon: 57.5012, region: "Africa" },

  // --- Americas ---
  { code: "US", name: "United States", capital: "Washington, D.C.", lat: 38.9072, lon: -77.0369, region: "Americas" },
  { code: "CA", name: "Canada", capital: "Ottawa", lat: 45.4215, lon: -75.6972, region: "Americas" },
  { code: "MX", name: "Mexico", capital: "Mexico City", lat: 19.4326, lon: -99.1332, region: "Americas" },
  { code: "BR", name: "Brazil", capital: "Brasília", lat: -15.7939, lon: -47.8828, region: "Americas" },
  { code: "AR", name: "Argentina", capital: "Buenos Aires", lat: -34.6037, lon: -58.3816, region: "Americas" },
  { code: "CL", name: "Chile", capital: "Santiago", lat: -33.4489, lon: -70.6693, region: "Americas" },
  { code: "PE", name: "Peru", capital: "Lima", lat: -12.0464, lon: -77.0428, region: "Americas" },
  { code: "CO", name: "Colombia", capital: "Bogotá", lat: 4.711, lon: -74.0721, region: "Americas" },
  { code: "VE", name: "Venezuela", capital: "Caracas", lat: 10.4806, lon: -66.9036, region: "Americas" },
  { code: "EC", name: "Ecuador", capital: "Quito", lat: -0.1807, lon: -78.4678, region: "Americas" },
  { code: "BO", name: "Bolivia", capital: "Sucre", lat: -19.0421, lon: -65.2559, region: "Americas" },
  { code: "UY", name: "Uruguay", capital: "Montevideo", lat: -34.9011, lon: -56.1645, region: "Americas" },
  { code: "PY", name: "Paraguay", capital: "Asunción", lat: -25.2637, lon: -57.5759, region: "Americas" },
  { code: "CU", name: "Cuba", capital: "Havana", lat: 23.1136, lon: -82.3666, region: "Americas" },
  { code: "JM", name: "Jamaica", capital: "Kingston", lat: 17.9714, lon: -76.7931, region: "Americas" },
  { code: "CR", name: "Costa Rica", capital: "San José", lat: 9.9281, lon: -84.0907, region: "Americas" },
  { code: "PA", name: "Panama", capital: "Panama City", lat: 8.9824, lon: -79.5199, region: "Americas" },
  { code: "GT", name: "Guatemala", capital: "Guatemala City", lat: 14.6349, lon: -90.5069, region: "Americas" },

  // --- Oceania ---
  { code: "AU", name: "Australia", capital: "Canberra", lat: -35.2809, lon: 149.13, region: "Oceania" },
  { code: "NZ", name: "New Zealand", capital: "Wellington", lat: -41.2866, lon: 174.7756, region: "Oceania" },
  { code: "FJ", name: "Fiji", capital: "Suva", lat: -18.1416, lon: 178.4419, region: "Oceania" },
  { code: "PG", name: "Papua New Guinea", capital: "Port Moresby", lat: -9.4438, lon: 147.1803, region: "Oceania" },
];

/**
 * Places the map games ask you to find. Deliberately a mix of world-famous
 * cities and Indian cities — the product's first audience is in India, and a
 * geography game where every answer is European is a game that tells that
 * audience it wasn't built for them.
 *
 * `fame` drives difficulty: 1 is "almost everyone knows roughly where this
 * is", 3 is "you need to actually know your map".
 */
export interface Place {
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  fame: 1 | 2 | 3;
  /** Set for places whose satellite view is distinctive enough to guess from. */
  landmark?: boolean;
}

export const PLACES: Place[] = [
  { name: "New Delhi", country: "India", countryCode: "IN", lat: 28.6139, lon: 77.209, fame: 1 },
  { name: "Mumbai", country: "India", countryCode: "IN", lat: 19.076, lon: 72.8777, fame: 1 },
  { name: "Bengaluru", country: "India", countryCode: "IN", lat: 12.9716, lon: 77.5946, fame: 1 },
  { name: "Hyderabad", country: "India", countryCode: "IN", lat: 17.385, lon: 78.4867, fame: 1 },
  { name: "Chennai", country: "India", countryCode: "IN", lat: 13.0827, lon: 80.2707, fame: 1 },
  { name: "Kolkata", country: "India", countryCode: "IN", lat: 22.5726, lon: 88.3639, fame: 1 },
  { name: "Jaipur", country: "India", countryCode: "IN", lat: 26.9124, lon: 75.7873, fame: 2 },
  { name: "Ahmedabad", country: "India", countryCode: "IN", lat: 23.0225, lon: 72.5714, fame: 2 },
  { name: "Pune", country: "India", countryCode: "IN", lat: 18.5204, lon: 73.8567, fame: 2 },
  { name: "Kochi", country: "India", countryCode: "IN", lat: 9.9312, lon: 76.2673, fame: 2 },
  { name: "Varanasi", country: "India", countryCode: "IN", lat: 25.3176, lon: 82.9739, fame: 2 },
  { name: "Amritsar", country: "India", countryCode: "IN", lat: 31.634, lon: 74.8723, fame: 3 },
  { name: "Guwahati", country: "India", countryCode: "IN", lat: 26.1445, lon: 91.7362, fame: 3 },
  { name: "Visakhapatnam", country: "India", countryCode: "IN", lat: 17.6868, lon: 83.2185, fame: 3 },

  { name: "Taj Mahal", country: "India", countryCode: "IN", lat: 27.1751, lon: 78.0421, fame: 1, landmark: true },
  { name: "Charminar", country: "India", countryCode: "IN", lat: 17.3616, lon: 78.4747, fame: 2, landmark: true },
  { name: "Gateway of India", country: "India", countryCode: "IN", lat: 18.922, lon: 72.8347, fame: 2, landmark: true },

  { name: "London", country: "United Kingdom", countryCode: "GB", lat: 51.5074, lon: -0.1278, fame: 1 },
  { name: "Paris", country: "France", countryCode: "FR", lat: 48.8566, lon: 2.3522, fame: 1 },
  { name: "New York City", country: "United States", countryCode: "US", lat: 40.7128, lon: -74.006, fame: 1 },
  { name: "Tokyo", country: "Japan", countryCode: "JP", lat: 35.6762, lon: 139.6503, fame: 1 },
  { name: "Dubai", country: "United Arab Emirates", countryCode: "AE", lat: 25.2048, lon: 55.2708, fame: 1 },
  { name: "Singapore", country: "Singapore", countryCode: "SG", lat: 1.3521, lon: 103.8198, fame: 1 },
  { name: "Sydney", country: "Australia", countryCode: "AU", lat: -33.8688, lon: 151.2093, fame: 1 },
  { name: "Rome", country: "Italy", countryCode: "IT", lat: 41.9028, lon: 12.4964, fame: 1 },
  { name: "Cairo", country: "Egypt", countryCode: "EG", lat: 30.0444, lon: 31.2357, fame: 1 },
  { name: "Moscow", country: "Russia", countryCode: "RU", lat: 55.7558, lon: 37.6173, fame: 1 },
  { name: "Beijing", country: "China", countryCode: "CN", lat: 39.9042, lon: 116.4074, fame: 1 },
  { name: "Rio de Janeiro", country: "Brazil", countryCode: "BR", lat: -22.9068, lon: -43.1729, fame: 1 },
  { name: "Cape Town", country: "South Africa", countryCode: "ZA", lat: -33.9249, lon: 18.4241, fame: 2 },
  { name: "Istanbul", country: "Türkiye", countryCode: "TR", lat: 41.0082, lon: 28.9784, fame: 1 },
  { name: "Bangkok", country: "Thailand", countryCode: "TH", lat: 13.7563, lon: 100.5018, fame: 1 },
  { name: "Toronto", country: "Canada", countryCode: "CA", lat: 43.6532, lon: -79.3832, fame: 2 },
  { name: "Buenos Aires", country: "Argentina", countryCode: "AR", lat: -34.6037, lon: -58.3816, fame: 2 },
  { name: "Nairobi", country: "Kenya", countryCode: "KE", lat: -1.2921, lon: 36.8219, fame: 2 },
  { name: "Seoul", country: "South Korea", countryCode: "KR", lat: 37.5665, lon: 126.978, fame: 2 },
  { name: "Jakarta", country: "Indonesia", countryCode: "ID", lat: -6.2088, lon: 106.8456, fame: 2 },
  { name: "Lagos", country: "Nigeria", countryCode: "NG", lat: 6.5244, lon: 3.3792, fame: 2 },
  { name: "Karachi", country: "Pakistan", countryCode: "PK", lat: 24.8607, lon: 67.0011, fame: 2 },
  { name: "Dhaka", country: "Bangladesh", countryCode: "BD", lat: 23.8103, lon: 90.4125, fame: 2 },
  { name: "Colombo", country: "Sri Lanka", countryCode: "LK", lat: 6.9271, lon: 79.8612, fame: 2 },
  { name: "Kathmandu", country: "Nepal", countryCode: "NP", lat: 27.7172, lon: 85.324, fame: 2 },
  { name: "Reykjavík", country: "Iceland", countryCode: "IS", lat: 64.1466, lon: -21.9426, fame: 3 },
  { name: "Ulaanbaatar", country: "Mongolia", countryCode: "MN", lat: 47.8864, lon: 106.9057, fame: 3 },
  { name: "Astana", country: "Kazakhstan", countryCode: "KZ", lat: 51.1694, lon: 71.4491, fame: 3 },
  { name: "Quito", country: "Ecuador", countryCode: "EC", lat: -0.1807, lon: -78.4678, fame: 3 },
  { name: "Wellington", country: "New Zealand", countryCode: "NZ", lat: -41.2866, lon: 174.7756, fame: 3 },
  { name: "Marrakesh", country: "Morocco", countryCode: "MA", lat: 31.6295, lon: -7.9811, fame: 3 },
  { name: "Vancouver", country: "Canada", countryCode: "CA", lat: 49.2827, lon: -123.1207, fame: 2 },
  { name: "Barcelona", country: "Spain", countryCode: "ES", lat: 41.3874, lon: 2.1686, fame: 2 },
  { name: "Amsterdam", country: "Netherlands", countryCode: "NL", lat: 52.3676, lon: 4.9041, fame: 2 },
  { name: "Berlin", country: "Germany", countryCode: "DE", lat: 52.52, lon: 13.405, fame: 1 },
  { name: "Venice", country: "Italy", countryCode: "IT", lat: 45.4408, lon: 12.3155, fame: 2, landmark: true },
  { name: "Machu Picchu", country: "Peru", countryCode: "PE", lat: -13.1631, lon: -72.545, fame: 2, landmark: true },
  { name: "Giza Pyramids", country: "Egypt", countryCode: "EG", lat: 29.9792, lon: 31.1342, fame: 1, landmark: true },
  { name: "Grand Canyon", country: "United States", countryCode: "US", lat: 36.1069, lon: -112.1129, fame: 2, landmark: true },
  { name: "Mount Fuji", country: "Japan", countryCode: "JP", lat: 35.3606, lon: 138.7274, fame: 2, landmark: true },
  { name: "Palm Jumeirah", country: "United Arab Emirates", countryCode: "AE", lat: 25.1124, lon: 55.139, fame: 2, landmark: true },
];

/** Great-circle distance in kilometres. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
