import { HashDatabase } from './types';

function makeAgentPortraitSvg(initials: string, primaryColor: string, secondaryColor: string, code: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="bg_${code}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0B0C10"/>
        <stop offset="60%" stop-color="#161922"/>
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.45"/>
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="60" fill="url(#bg_${code})"/>
    <circle cx="60" cy="60" r="56" fill="none" stroke="${primaryColor}" stroke-width="2.5" stroke-dasharray="18 6"/>
    <circle cx="60" cy="60" r="49" fill="none" stroke="${secondaryColor}" stroke-width="1" stroke-opacity="0.4"/>
    <polygon points="60,14 98,36 98,84 60,106 22,84 22,36" fill="${primaryColor}" fill-opacity="0.12" stroke="${primaryColor}" stroke-width="1.5"/>
    <text x="60" y="68" text-anchor="middle" fill="#FFFFFF" font-family="Chakra Petch, Arial Black, sans-serif" font-weight="700" font-style="italic" font-size="31" letter-spacing="1">${initials}</text>
    <text x="60" y="92" text-anchor="middle" fill="${primaryColor}" font-family="JetBrains Mono, monospace" font-weight="700" font-size="10">${code}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_HASH_DB: HashDatabase = {
  schema_version: '2.4',
  game_patch: '1.6.0 // NEW ERIDU HDD SYNC',
  last_synced: '2026-10-16T03:20:00Z',
  agents: {
    ellen_joe: {
      agent_id: 'ellen_joe',
      display_name: 'Ellen Joe',
      folder_name: 'Ellen',
      faction: 'Victoria Housekeeping Co.',
      element: 'Ice',
      accent_color: '#00F0FF',
      portrait_svg: makeAgentPortraitSvg('EJ', '#00F0FF', '#FF2A54', 'VHC-01'),
      current_hashes: {
        position_vb: '6291a8c4',
        blend_vb: '3d10f9a2',
        texcoord_vb: '7b82e110',
        ib: '9f4e21b0',
      },
      legacy_hash_migrations: {
        '1a2b3c4d': '6291a8c4',
        '5e6f7a8b': '9f4e21b0',
        '8a3f1c92': '6291a8c4',
      },
      stride_patch: {
        expected_stride: 40,
        bone_index_map: { 14: 15, 15: 16, 22: 24 },
        description: 'Patch 1.4+ Tail & Skirt Bone Weight Index Remap',
      },
    },
    miyabi: {
      agent_id: 'miyabi',
      display_name: 'Hoshimi Miyabi',
      folder_name: 'Miyabi',
      faction: 'Hollow Special Operations Section 6',
      element: 'Frost',
      accent_color: '#38BDF8',
      portrait_svg: makeAgentPortraitSvg('HM', '#38BDF8', '#00F0FF', 'HSOS6-01'),
      current_hashes: {
        position_vb: 'c48190e2',
        blend_vb: 'a19044b8',
        texcoord_vb: 'f31280c9',
        ib: '77d419a0',
      },
      legacy_hash_migrations: {
        'deadbeef': 'c48190e2',
        'b40192f1': '77d419a0',
        '11223344': 'a19044b8',
      },
      stride_patch: {
        expected_stride: 40,
        bone_index_map: { 8: 9, 9: 10, 31: 33 },
        description: 'Post-patch Haori Coat & Scabbard Vertex Stride Fix',
      },
    },
    jane_doe: {
      agent_id: 'jane_doe',
      display_name: 'Jane Doe',
      folder_name: 'JaneDoe',
      faction: 'Criminal Investigation Special Response Team',
      element: 'Physical',
      accent_color: '#FF2A54',
      portrait_svg: makeAgentPortraitSvg('JD', '#FF2A54', '#FFE600', 'CISRT-03'),
      current_hashes: {
        position_vb: '49a1d088',
        blend_vb: '82c4110f',
        texcoord_vb: '19e04a72',
        ib: 'e5091b3c',
      },
      legacy_hash_migrations: {
        '49a10001': '49a1d088',
        'e5090002': 'e5091b3c',
      },
      stride_patch: {
        expected_stride: 40,
        bone_index_map: { 18: 19, 19: 20 },
        description: 'Rat Tail Stinger Rig Index Alignment',
      },
    },
    von_lycaon: {
      agent_id: 'von_lycaon',
      display_name: 'Von Lycaon',
      folder_name: 'Lycaon',
      faction: 'Victoria Housekeeping Co.',
      element: 'Ice',
      accent_color: '#94A3B8',
      portrait_svg: makeAgentPortraitSvg('VL', '#94A3B8', '#00F0FF', 'VHC-02'),
      current_hashes: {
        position_vb: '30f8a12d',
        blend_vb: '91b4c20e',
        texcoord_vb: '64d9e811',
        ib: 'c8201f4a',
      },
      legacy_hash_migrations: {
        '30f80099': '30f8a12d',
        'c8200099': 'c8201f4a',
      },
    },
    zhu_yuan: {
      agent_id: 'zhu_yuan',
      display_name: 'Zhu Yuan',
      folder_name: 'ZhuYuan',
      faction: 'Criminal Investigation Special Response Team',
      element: 'Ether',
      accent_color: '#A855F7',
      portrait_svg: makeAgentPortraitSvg('ZY', '#A855F7', '#00F0FF', 'CISRT-01'),
      current_hashes: {
        position_vb: '55e92c10',
        blend_vb: 'd0418a22',
        texcoord_vb: '89f113b4',
        ib: '22a70c9e',
      },
      legacy_hash_migrations: {
        '55e90000': '55e92c10',
        '22a70000': '22a70c9e',
      },
    },
    caesar_king: {
      agent_id: 'caesar_king',
      display_name: 'Caesar King',
      folder_name: 'Caesar',
      faction: 'Sons of Calydon',
      element: 'Physical',
      accent_color: '#FFE600',
      portrait_svg: makeAgentPortraitSvg('CK', '#FFE600', '#B8FF01', 'SOC-01'),
      current_hashes: {
        position_vb: '78b210f4',
        blend_vb: '12c904e8',
        texcoord_vb: '44a890d1',
        ib: '90e123c7',
      },
      legacy_hash_migrations: {
        '78b20011': '78b210f4',
      },
    },
    burnice_white: {
      agent_id: 'burnice_white',
      display_name: 'Burnice White',
      folder_name: 'Burnice',
      faction: 'Sons of Calydon',
      element: 'Fire',
      accent_color: '#FB923C',
      portrait_svg: makeAgentPortraitSvg('BW', '#FB923C', '#FFE600', 'SOC-02'),
      current_hashes: {
        position_vb: 'e1209a8b',
        blend_vb: '34f812c0',
        texcoord_vb: '67d019e4',
        ib: 'b9012f3a',
      },
      legacy_hash_migrations: {
        'e12000aa': 'e1209a8b',
      },
    },
    anby_demara: {
      agent_id: 'anby_demara',
      display_name: 'Anby Demara',
      folder_name: 'Anby',
      faction: 'Cunning Hares',
      element: 'Electric',
      accent_color: '#B8FF01',
      portrait_svg: makeAgentPortraitSvg('AD', '#B8FF01', '#00F0FF', 'CH-01'),
      current_hashes: {
        position_vb: '10a94c82',
        blend_vb: '58b219d0',
        texcoord_vb: '93c401e7',
        ib: 'f01928a4',
      },
      legacy_hash_migrations: {
        '10a90011': '10a94c82',
      },
    },
    nicole_demara: {
      agent_id: 'nicole_demara',
      display_name: 'Nicole Demara',
      folder_name: 'Nicole',
      faction: 'Cunning Hares',
      element: 'Ether',
      accent_color: '#F472B6',
      portrait_svg: makeAgentPortraitSvg('ND', '#F472B6', '#FFE600', 'CH-02'),
      current_hashes: {
        position_vb: '84d120a9',
        blend_vb: '29e014c8',
        texcoord_vb: '71b839f0',
        ib: 'd40192e3',
      },
      legacy_hash_migrations: {
        '84d10011': '84d120a9',
      },
    },
    astra_yao: {
      agent_id: 'astra_yao',
      display_name: 'Astra Yao',
      folder_name: 'AstraYao',
      faction: 'Stars of Lyra',
      element: 'Ether',
      accent_color: '#FDE047',
      portrait_svg: makeAgentPortraitSvg('AY', '#FDE047', '#A855F7', 'SOL-01'),
      current_hashes: {
        position_vb: 'a9014e2c',
        blend_vb: '62f819b0',
        texcoord_vb: '38c104d9',
        ib: '51e920a7',
      },
      legacy_hash_migrations: {
        'a9010001': 'a9014e2c',
      },
    },
  },
};
