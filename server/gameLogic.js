const CARD_TYPES = {
  ATTACK: 'attack',
  DEFENSE: 'defense',
  EFFECT: 'effect'
};

const EFFECT_SUBTYPES = {
  // Base
  HEAL: 'heal', WEAKEN: 'weaken', REDRAW: 'redraw', MANA_BURN: 'mana_burn',
  SMOKE: 'smoke', MIGHT: 'might', COIN: 'coin', PURIFY: 'purify',
  HASTE: 'haste', TELEPORT: 'teleport',
  // Special
  CROSSBOW: 'crossbow', REFLECTOR: 'reflector', GATE_MAGIC: 'gate_magic',
  // Holy (Blessed)
  GRAIL: 'grail', MIRACLE: 'miracle', ANGEL_WIND: 'angel_wind', HOLY_LIGHT: 'holy_light',
  // Dark (Cursed)
  PARADISE: 'lost_paradise', CONTRACT: 'contract', FORBIDDEN: 'forbidden'
};

const TAGS = {
  NONE: 'none',
  // Offensive
  SPEAR: 'spear', DAGGER: 'dagger', CLAYMORE: 'claymore', TWIN: 'twin',
  FIRE: 'fire', ICE: 'ice', SCYTHE: 'scythe', WHIP: 'whip', MACE: 'mace', EXECUTE: 'execute',
  EXCALIBUR: 'excalibur', GUNGNIR: 'gungnir', MJOLNIR: 'mjolnir',
  LONGINUS: 'longinus', LAVA_SPEAR: 'lava_spear',
  // Defensive
  THORN: 'thorn', MOONLIGHT: 'moonlight', AEGIS: 'aegis', TOWER: 'tower',
  PARRY: 'parry', MIRROR: 'mirror', CRYSTAL: 'crystal', BUCKLER: 'buckler',
  IRON: 'iron', RHO_AIAS: 'rho_aias', GOD_HAND: 'god_hand', OBSIDIAN: 'obsidian'
};

/**
 * Deck Generation (Base 30)
 */
function generateDeck() {
  const deck = [];

  // 10 Attack Types
  const atkTypes = [
    { tag: TAGS.NONE, name: '스트라이크', val: 10, desc: '기본 공격.' },
    { tag: TAGS.SPEAR, name: '스피어', val: 12, desc: '방어력 50% 무시.' },
    { tag: TAGS.DAGGER, name: '단검', val: 8, desc: '출혈 부여 (5데미지 / 5턴).' },
    { tag: TAGS.CLAYMORE, name: '클레이모어', val: 20, desc: '강력한 대검.' },
    { tag: TAGS.TWIN, name: '듀얼 소드', val: 15, desc: '두번 공격한다.' },
    { tag: TAGS.FIRE, name: '화염의 검', val: 12, desc: '화염 부여 (10데미지 / 2턴).' },
    { tag: TAGS.ICE, name: '얼음의 날', val: 12, desc: '상대를 얼려버린다.' },
    { tag: TAGS.SCYTHE, name: '사신의 낫', val: 15, desc: '생명력 흡수 50%.' },
    { tag: TAGS.EXECUTE, name: '사신의 손길', val: 10, desc: '실행: HP 20 미만 시 즉사.' },
    { tag: TAGS.MACE, name: '메이스', val: 14, desc: '일정 확률로 스턴.' }
  ];

  // 10 Defense Types
  const defTypes = [
    { tag: TAGS.NONE, name: '방동', val: 10, desc: '기본 방어.' },
    { tag: TAGS.THORN, name: '가시 방패', val: 10, desc: '데미지 50% 반사.' },
    { tag: TAGS.MOONLIGHT, name: '월광 방패', val: 5, desc: '모든 데미지 무효.' },
    { tag: TAGS.AEGIS, name: '아이기스', val: 12, desc: '방어 성공 시 포인트 획득.' },
    { tag: TAGS.TOWER, name: '타워 실드', val: 25, desc: '탑처럼 거대한 방패.' },
    { tag: TAGS.PARRY, name: '패링 단검', val: 8, desc: '데미지 100% 반사.' },
    { tag: TAGS.MIRROR, name: '유리 흉갑', val: 12, desc: '마법을 방어하는 흉갑.' },
    { tag: TAGS.CRYSTAL, name: '수정 방패', val: 15, desc: '약하지만 강력한 수정 방패.' },
    { tag: TAGS.BUCKLER, name: '버클러', val: 6, desc: '빠르지만 약하다.' },
    { tag: TAGS.IRON, name: '철벽', val: 20, desc: '견고한 철벽.' }
  ];

  // 10 Effect Types
  const effTypes = [
    { sub: EFFECT_SUBTYPES.HEAL, name: '회복 약물', val: 15, desc: 'HP 15 회복.' },
    { sub: EFFECT_SUBTYPES.WEAKEN, name: '약화', desc: '다음 상대 공격력 절반 감소.' },
    { sub: EFFECT_SUBTYPES.REDRAW, name: '시간 워프', desc: '패 모두 교체.' },
    { sub: EFFECT_SUBTYPES.MANA_BURN, name: '마나 태우기', desc: '상대 포인트 소진.' },
    { sub: EFFECT_SUBTYPES.SMOKE, name: '연막탄', desc: '다음 공격 회피.' },
    { sub: EFFECT_SUBTYPES.MIGHT, name: '힘의 스크롤', val: 10, desc: '이번 라운드 공격력 +10.' },
    { sub: EFFECT_SUBTYPES.COIN, name: '행운의 동전', desc: '랜덤 효과.' },
    { sub: EFFECT_SUBTYPES.PURIFY, name: '정화', desc: '상태이상 제거.' },
    { sub: EFFECT_SUBTYPES.HASTE, name: '신속', desc: '카드 추가 드로우.' },
    { sub: EFFECT_SUBTYPES.TELEPORT, name: '공간 이동', desc: '전장 이동.' }
  ];

  for (let i = 0; i < 60; i++) {
    const atk = atkTypes[i % atkTypes.length];
    deck.push({ id: `atk_${i}_${Math.random()}`, type: CARD_TYPES.ATTACK, subTag: atk.tag, name: atk.name, desc: atk.desc, value: atk.val, mergeCount: 1 });
  }
  for (let i = 0; i < 60; i++) {
    const def = defTypes[i % defTypes.length];
    deck.push({ id: `def_${i}_${Math.random()}`, type: CARD_TYPES.DEFENSE, subTag: def.tag, name: def.name, desc: def.desc, value: def.val, mergeCount: 1 });
  }
  for (let i = 0; i < 30; i++) {
    const eff = effTypes[i % effTypes.length];
    deck.push({ id: `eff_${i}_${Math.random()}`, type: CARD_TYPES.EFFECT, subType: eff.sub, name: eff.name, desc: eff.desc, value: eff.val || 0, mergeCount: 1 });
  }

  return shuffle(deck);
}

/**
 * Get Event Card Pool (30 + 30)
 */
function getEventCardPool(event) {
  if (event === 'blessed_land') {
    return [
      { id: `ev_at_1`, type: CARD_TYPES.ATTACK, subTag: TAGS.LONGINUS, name: '롱기누스의 창', value: 30, desc: '방어무시 데미지.' },
      { id: `ev_at_2`, type: CARD_TYPES.ATTACK, subTag: TAGS.EXCALIBUR, name: '엑스캘리버', value: 35, desc: '성검. 막강한 공격력.' },
      { id: `ev_at_3`, type: CARD_TYPES.ATTACK, subTag: TAGS.GUNGNIR, name: '궁니르', value: 25, desc: '관통 데미지 부여.' },
      { id: `ev_df_1`, type: CARD_TYPES.DEFENSE, subTag: TAGS.RHO_AIAS, name: '로아 아이아스', value: 30, desc: '신성한 실드. 모든 것을 막는다.' },
      { id: `ev_df_2`, type: CARD_TYPES.DEFENSE, subTag: TAGS.GOD_HAND, name: '갓 핸드', value: 40, desc: '절대적 방어.' },
      { id: `ev_ef_1`, type: CARD_TYPES.EFFECT, subType: EFFECT_SUBTYPES.GRAIL, name: '성배', value: 50, desc: 'HP 완전 회복.' },
      { id: `ev_ef_2`, type: CARD_TYPES.EFFECT, subType: EFFECT_SUBTYPES.HOLY_LIGHT, name: '성스러운 빛', desc: '모두를 실명시킨다.' }
    ];
  } else if (event === 'abyssal_fog') {
    return [
      { id: `ev_at_6`, type: CARD_TYPES.ATTACK, subTag: TAGS.DAGGER, name: '은단의 날', value: 15, desc: '집중 시열 (5x5).' },
      { id: `ev_ef_5`, type: CARD_TYPES.EFFECT, subType: EFFECT_SUBTYPES.SMOKE, name: '연기 폭탄', desc: '다음 공격 회피.' }
    ];
  } else if (event === 'golden_age') {
    return [
      { id: `ev_ef_6`, type: CARD_TYPES.EFFECT, subType: EFFECT_SUBTYPES.MIGHT, name: '힘의 권론서', value: 10, desc: '이번 라운드 공격력 +10.' },
      { id: `ev_ef_7`, type: CARD_TYPES.EFFECT, subType: EFFECT_SUBTYPES.HEAL, name: '상급 간이약', value: 25, desc: 'HP 25 회복.' }
    ];
  } else if (event === 'blood_festival') {
    return [
      { id: `ev_at_7`, type: CARD_TYPES.ATTACK, subTag: TAGS.LAVA_SPEAR, name: '용암 창', value: 30, desc: '화염 부여 (10x2).' },
      { id: `ev_at_8`, type: CARD_TYPES.ATTACK, subTag: TAGS.MJOLNIR, name: '메르니르', value: 35, desc: '스턴 강타.' }
    ];
  } else if (event === 'cursed_land') {
    return [
      { id: `ev_at_4`, type: CARD_TYPES.ATTACK, subTag: TAGS.LAVA_SPEAR, name: '용암 창', value: 30, desc: '화염 부여 (10x2).' },
      { id: `ev_at_5`, type: CARD_TYPES.ATTACK, subTag: TAGS.MJOLNIR, name: '메르니르', value: 35, desc: '스턴 강타.' },
      { id: `ev_df_3`, type: CARD_TYPES.DEFENSE, subTag: TAGS.OBSIDIAN, name: '흑요수 갑주', value: 30, desc: '데미지 100% 반사.' },
      { id: `ev_ef_3`, type: CARD_TYPES.EFFECT, subType: EFFECT_SUBTYPES.PARADISE, name: '걸말라저안 에데니', value: 30, desc: '범위 30 데미지.' },
      { id: `ev_ef_4`, type: CARD_TYPES.EFFECT, subType: EFFECT_SUBTYPES.CONTRACT, name: '영혼의 계약', desc: '포인트 매만, HP -20.' }
    ];
  }

  // 기본 폴백 커드
  return [
    { id: `ev_fallback_1`, type: CARD_TYPES.ATTACK, name: '심연의 단검', value: 15, desc: '기본 무기.' },
    { id: `ev_fallback_2`, type: CARD_TYPES.DEFENSE, name: '기본 방패', value: 10, desc: '기본 방어.' }
  ];
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function mergeCards(cards) {
  if (cards.length < 2 || cards.length > 4) return null;
  const baseCard = cards[0];
  if (baseCard.type === CARD_TYPES.EFFECT) return null;
  const allIdentical = cards.every(c => c.name === baseCard.name && c.type === baseCard.type);
  if (!allIdentical) return null;

  const totalMergeCount = cards.reduce((sum, c) => sum + (c.mergeCount || 1), 0);
  const newValue = Math.floor(baseCard.value * (1 + (totalMergeCount - 1) * 0.5));

  return {
    ...baseCard,
    id: `merged_${Math.random()}`,
    value: newValue,
    mergeCount: totalMergeCount
  };
}

/**
 * Combat Resolution 3.0 (Dopamine Overhaul)
 */
function resolveDuel(atkItem, defItem, attacker, defender, finalAtkVal, finalDefVal, fieldEvent) {
  let atkVal = finalAtkVal || 0;
  let defVal = finalDefVal || 0;

  let atkDamageTaken = 0;
  let defDamageTaken = 0;
  let statusToInflict = null;

  if (defender?.isEvading) {
    return { atkDamage: 0, defDamage: 0, statusToInflict: null, reflectDmg: 0 };
  }

  // Tags Pre-Process
  if (atkItem?.card.subTag === TAGS.SPEAR) defVal = Math.floor(defVal * 0.5);
  if (atkItem?.card.subTag === TAGS.LONGINUS || atkItem?.card.subTag === TAGS.GUNGNIR || atkItem?.card.subTag === TAGS.EXCALIBUR) defVal = 0;

  if (defItem?.card.subTag === TAGS.MOONLIGHT) atkVal = 0;
  if (defItem?.card.subTag === TAGS.RHO_AIAS || defItem?.card.subTag === TAGS.GOD_HAND) {
    if (atkItem?.card.subTag !== TAGS.LONGINUS) atkVal = 0;
  }

  // Calculate Main Damage
  defDamageTaken = Math.max(0, atkVal - defVal);

  // Execution Mechanic
  if (atkItem?.card.subTag === TAGS.EXECUTE && defender && defender.hp < 20 && defDamageTaken > 0) {
    defDamageTaken = 100; // Execution!
  }

  // Status & Special Effects
  if (defDamageTaken > 0 && atkItem) {
    if (atkItem.card.subTag === TAGS.DAGGER) statusToInflict = { type: 'bleed', duration: 5, damagePerTurn: 5 };
    if (atkItem.card.subTag === TAGS.FIRE || atkItem.card.subTag === TAGS.LAVA_SPEAR) statusToInflict = { type: 'fire', duration: 2, damagePerTurn: 10 };
    if (atkItem.card.subTag === TAGS.MACE || atkItem.card.subTag === TAGS.MJOLNIR) statusToInflict = { type: 'stun', duration: 1, damagePerTurn: 0 };

    // Lifesteal
    if (atkItem.card.subTag === TAGS.SCYTHE) {
      const heal = Math.floor(defDamageTaken * 0.5);
      attacker.hp = Math.min(100, attacker.hp + heal);
    }
  }

  // Reflect Damage
  let reflectDmg = 0;
  if (defItem) {
    if (defItem.card.subTag === TAGS.THORN) reflectDmg = Math.floor(atkVal * 0.5);
    if (defItem.card.subTag === TAGS.PARRY || defItem.card.subTag === TAGS.OBSIDIAN) reflectDmg = atkVal;
  }
  atkDamageTaken = reflectDmg;

  // Blood Festival logic (Double damage, Winner takes 5 recoil)
  if (fieldEvent === 'blood_festival') {
    const originalDefDmg = defDamageTaken;
    defDamageTaken *= 2;
    if (originalDefDmg > 0) {
      attacker.hp = Math.max(0, attacker.hp - 5);
    }
  }

  return {
    atkDamage: atkDamageTaken,
    defDamage: defDamageTaken,
    statusToInflict,
    reflectDmg
  };
}

module.exports = {
  CARD_TYPES,
  EFFECT_SUBTYPES,
  TAGS,
  generateDeck,
  getEventCardPool,
  mergeCards,
  resolveDuel
};
