const NATUREZAS = [
  "hardy","lonely","brave","adamant","naughty",
  "bold","docile","relaxed","impish","lax",
  "timid","hasty","serious","jolly","naive",
  "modest","mild","quiet","bashful","rash",
  "calm","gentle","sassy","careful","quirky"
];
const NATURE_MODIFIERS = {
  lonely:  { up: "atk", down: "def"  },
  brave:   { up: "atk", down: "spe"  },
  adamant: { up: "atk", down: "spa"  },
  naughty: { up: "atk", down: "spd"  },
  bold:    { up: "def", down: "atk"  },
  relaxed: { up: "def", down: "spe"  },
  impish:  { up: "def", down: "spa"  },
  lax:     { up: "def", down: "spd"  },
  timid:   { up: "spe", down: "atk"  },
  hasty:   { up: "spe", down: "def"  },
  jolly:   { up: "spe", down: "spa"  },
  naive:   { up: "spe", down: "spd"  },
  modest:  { up: "spa", down: "atk"  },
  mild:    { up: "spa", down: "def"  },
  quiet:   { up: "spa", down: "spe"  },
  rash:    { up: "spa", down: "spd"  },
  calm:    { up: "spd", down: "atk"  },
  gentle:  { up: "spd", down: "def"  },
  sassy:   { up: "spd", down: "spe"  },
  careful: { up: "spd", down: "spa"  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcStat(base, iv, ev, nivel, natureza, statKey) {
  const evBonus = Math.floor(ev / 4);
  let stat;
  if (statKey === "hp") {
    stat = Math.floor(((2 * base + iv + evBonus) * nivel) / 100) + nivel + 10;
  } else {
    stat = Math.floor(((2 * base + iv + evBonus) * nivel) / 100) + 5;
    const nat = NATURE_MODIFIERS[natureza];
    if (nat?.up   === statKey) stat = Math.floor(stat * 1.1);
    if (nat?.down === statKey) stat = Math.floor(stat * 0.9);
  }
  return stat;
}

module.exports = { NATUREZAS, NATURE_MODIFIERS, calcStat };
