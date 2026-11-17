// Biome definitions shared by the renderer: terrain palette, sky / fog colours and how much vegetation grows.
// The sim only knows `map.biome` (a string); heightmap shapes are chosen in sim/map.js.
export const BIOMES = {
  temperate: {
    name: 'Temperate', hor: [0.50, 0.66, 0.84], zen: [0.10, 0.28, 0.66], grassMul: 1, treeMul: 1,
    pal: { sand: 0xc4b685, grass: 0x5b7d3b, grass2: 0x748a45, dirt: 0x7d7a55, rock: 0x77746d, rock2: 0x8b8a86, snow: 0xbfc5cc, seabed: 0x34596a, wet: 0x8f8a63 },
  },
  desert: {
    name: 'Desert', hor: [0.84, 0.74, 0.58], zen: [0.20, 0.38, 0.70], grassMul: 0.14, treeMul: 0.5,
    pal: { sand: 0xd9c38c, grass: 0xcfae70, grass2: 0xbd9358, dirt: 0xa6774b, rock: 0x8d6a4d, rock2: 0xa88666, snow: 0xc9a47a, seabed: 0x3b6a76, wet: 0xb9a273 },
  },
  arctic: {
    name: 'Arctic', hor: [0.76, 0.84, 0.92], zen: [0.22, 0.38, 0.62], grassMul: 0.1, treeMul: 0.7,
    pal: { sand: 0xe6edf2, grass: 0xdfe8ee, grass2: 0xcad6df, dirt: 0x9ca7b0, rock: 0x6f757b, rock2: 0x8e9499, snow: 0xf4f8fb, seabed: 0x35617a, wet: 0xb8c6cf },
  },
  jungle: {
    name: 'Jungle', hor: [0.54, 0.66, 0.58], zen: [0.12, 0.32, 0.52], grassMul: 1.5, treeMul: 2.4,
    pal: { sand: 0xb8aa78, grass: 0x2f6a2a, grass2: 0x3d7a2c, dirt: 0x5a5a35, rock: 0x5f625a, rock2: 0x76796f, snow: 0x8a9b86, seabed: 0x2d5d64, wet: 0x6c6a45 },
  },
  volcanic: {
    name: 'Volcanic', hor: [0.46, 0.38, 0.35], zen: [0.14, 0.14, 0.2], grassMul: 0.03, treeMul: 0.35,
    pal: { sand: 0x6a6159, grass: 0x57504a, grass2: 0x4a443f, dirt: 0x6b5444, rock: 0x403c3a, rock2: 0x6a625c, snow: 0x8a6f5e, seabed: 0x23383f, wet: 0x2e2b2a },
  },
};
export const BIOME_IDS = Object.keys(BIOMES);
export const biomeOf = (map) => BIOMES[(map && map.biome) || 'temperate'] || BIOMES.temperate;
