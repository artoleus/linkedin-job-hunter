// Approximate coordinates for UK towns, cities and regions (offline, no
// geocoding service). Used for the home town setting and the distance check
// on hybrid jobs.

const UkPlaces = {
  TOWNS: {
    // Cities
    'london': [51.5074, -0.1278], 'manchester': [53.4808, -2.2426], 'birmingham': [52.4862, -1.8904],
    'leeds': [53.8008, -1.5491], 'liverpool': [53.4084, -2.9916], 'bristol': [51.4545, -2.5879],
    'sheffield': [53.3811, -1.4701], 'edinburgh': [55.9533, -3.1883], 'glasgow': [55.8642, -4.2518],
    'cardiff': [51.4816, -3.1791], 'newcastle': [54.9783, -1.6178], 'nottingham': [52.9548, -1.1581],
    'southampton': [50.9097, -1.4044], 'portsmouth': [50.8198, -1.0880], 'leicester': [52.6369, -1.1398],
    'coventry': [52.4068, -1.5197], 'hull': [53.7457, -0.3367], 'stoke-on-trent': [53.0027, -2.1794],
    'stoke': [53.0027, -2.1794], 'derby': [52.9225, -1.4746], 'plymouth': [50.3755, -4.1427],
    'wolverhampton': [52.5864, -2.1285], 'reading': [51.4543, -0.9781], 'northampton': [52.2405, -0.9027],
    'luton': [51.8787, -0.4200], 'bolton': [53.5768, -2.4282], 'aberdeen': [57.1497, -2.0943],
    'dundee': [56.4620, -2.9707], 'inverness': [57.4778, -4.2247], 'belfast': [54.5973, -5.9301],
    'swansea': [51.6214, -3.9436], 'newport': [51.5842, -2.9977], 'york': [53.9600, -1.0873],
    'exeter': [50.7184, -3.5339], 'bath': [51.3811, -2.3590], 'norwich': [52.6309, 1.2974],
    'ipswich': [52.0567, 1.1482], 'peterborough': [52.5695, -0.2405], 'milton keynes': [52.0406, -0.7594],
    'swindon': [51.5558, -1.7797], 'gloucester': [51.8642, -2.2382], 'cheltenham': [51.8994, -2.0783],
    'worcester': [52.1920, -2.2200], 'bournemouth': [50.7192, -1.8808], 'poole': [50.7150, -1.9872],
    'salisbury': [51.0688, -1.7945], 'winchester': [51.0632, -1.3080], 'basingstoke': [51.2665, -1.0924],
    'sunderland': [54.9069, -1.3838], 'middlesbrough': [54.5742, -1.2350], 'durham': [54.7753, -1.5849],
    'bradford': [53.7960, -1.7594], 'huddersfield': [53.6458, -1.7850], 'wakefield': [53.6833, -1.4977],
    'preston': [53.7632, -2.7031], 'blackpool': [53.8175, -3.0357], 'lancaster': [54.0466, -2.8007],
    'chester': [53.1934, -2.8931], 'warrington': [53.3900, -2.5970], 'stockport': [53.4106, -2.1575],
    'lincoln': [53.2307, -0.5406], 'colchester': [51.8959, 0.8919], 'chelmsford': [51.7356, 0.4685],
    'southend': [51.5459, 0.7077], 'basildon': [51.5761, 0.4887], 'watford': [51.6565, -0.3903],
    'st albans': [51.7520, -0.3360], 'stevenage': [51.9038, -0.1966], 'bedford': [52.1360, -0.4667],
    'high wycombe': [51.6286, -0.7482], 'aylesbury': [51.8168, -0.8124], 'oxford': [51.7520, -1.2577],
    'cambridge': [52.2053, 0.1218],

    // South East
    'brighton': [50.8225, -0.1372], 'canterbury': [51.2802, 1.0789], 'maidstone': [51.2704, 0.5227],
    'ashford': [51.1465, 0.8750], 'rochester': [51.3882, 0.5046], 'chatham': [51.3794, 0.5299],
    'gillingham': [51.3889, 0.5500], 'sittingbourne': [51.3403, 0.7351], 'faversham': [51.3155, 0.8910],
    'margate': [51.3813, 1.3862], 'ramsgate': [51.3355, 1.4166], 'dover': [51.1279, 1.3134],
    'folkestone': [51.0814, 1.1695], 'dartford': [51.4462, 0.2169], 'gravesend': [51.4414, 0.3685],
    'sevenoaks': [51.2724, 0.1909], 'tonbridge': [51.1951, 0.2745], 'tunbridge wells': [51.1320, 0.2630],
    'guildford': [51.2362, -0.5704], 'slough': [51.5105, -0.5950], 'woking': [51.3168, -0.5580],
    'crawley': [51.1130, -0.1863], 'worthing': [50.8142, -0.3714], 'eastbourne': [50.7684, 0.2905],
    'hastings': [50.8543, 0.5730], 'croydon': [51.3762, -0.0982], 'bromley': [51.4060, 0.0149],
    'kingston': [51.4123, -0.3007], 'reigate': [51.2372, -0.2059], 'horsham': [51.0629, -0.3259],
    'chichester': [50.8365, -0.7792], 'farnborough': [51.2868, -0.7526], 'bracknell': [51.4136, -0.7505],
    'maidenhead': [51.5218, -0.7177], 'london bridge': [51.5055, -0.0865], 'canary wharf': [51.5054, -0.0235]
  },

  // Broad areas, used only when no town matches
  REGIONS: {
    'kent': [51.2787, 0.5217], 'surrey': [51.3148, -0.5600], 'sussex': [50.9280, -0.4617],
    'essex': [51.7670, 0.4000], 'greater london': [51.5074, -0.1278], 'hampshire': [51.0577, -1.3081],
    'berkshire': [51.4550, -1.1530], 'hertfordshire': [51.8098, -0.2377], 'yorkshire': [53.9591, -1.0815],
    'lancashire': [53.7632, -2.7031], 'scotland': [56.4907, -4.2026], 'wales': [52.1307, -3.7837],
    'england': [52.3555, -1.1743], 'united kingdom': [54.5973, -3.8142], 'uk': [54.5973, -3.8142]
  },

  // Coordinates for a place named anywhere in the text ("Maidstone, Kent (Hybrid)"),
  // preferring a town over a region and the longest matching name. null if unknown.
  find(text) {
    const t = ` ${String(text || '').toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ')} `;
    for (const table of [UkPlaces.TOWNS, UkPlaces.REGIONS]) {
      const match = Object.keys(table)
        .sort((a, b) => b.length - a.length)
        .find(name => t.includes(` ${name} `));
      if (match) {
        const [lat, lng] = table[match];
        return { name: match, lat, lng };
      }
    }
    return null;
  },

  // Straight-line distance in miles
  distanceMiles(a, b) {
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 3959 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
};

window.UkPlaces = UkPlaces;
