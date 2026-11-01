// The Last Resort — game content: items, messes, guest archetypes, names, check-in cards,
// survey comments, shifts (rounds) and upgrades. Pure data + small generators.
import { pick, randi, rand, chance } from './util.js';

// ---------- items ----------
export const ITEMS = {
  mop: { name: 'Mop', tool: true },
  net: { name: 'Pool Net', tool: true },
  plunger: { name: 'Plunger', tool: true },
  luggage: { name: 'Suitcase', heavy: 0.85 },
  towels: { name: 'Towels' },
  egg_raw: { name: 'Raw Eggs', food: true, cook: 'eggs' },
  batter: { name: 'Pancake Batter', food: true, cook: 'pancakes' },
  bacon_raw: { name: 'Raw Bacon', food: true, cook: 'bacon' },
  blood: { name: 'Blood Bag', food: true },
  battery: { name: 'AA Batteries', food: true },
  eggs: { name: 'Fried Eggs', food: true },
  pancakes: { name: 'Pancakes', food: true },
  bacon: { name: 'Bacon', food: true },
  coffee: { name: 'Coffee', food: true },
  bread: { name: 'Bread', food: true, cook: 'toast' },
  toast: { name: 'Toast', food: true },
  juice: { name: 'Orange Juice', food: true },
  burnt: { name: 'Burnt Mess', food: true },
  tray: { name: 'Serving Tray' },
  cheese: { name: 'Cheese' },
  omelette: { name: 'Cheese Omelette', food: true },
  cocoa: { name: 'Hot Cocoa', food: true },
  waffles: { name: 'Waffles', food: true },
  extinguisher: { name: 'Fire Extinguisher', tool: true },
  medkit: { name: 'First Aid Kit', tool: true },
  keycard: { name: 'Spare Key Card' },
  dishes: { name: 'Dirty Dishes', heavy: 0.85 },
  body: { name: 'Body Bag', heavy: 0.55 },
};

export const DISHES = {
  eggs: { name: 'Fried Eggs', icon: '🍳' },
  pancakes: { name: 'Pancakes', icon: '🥞' },
  bacon: { name: 'Bacon', icon: '🥓' },
  coffee: { name: 'Coffee', icon: '☕' },
  toast: { name: 'Toast', icon: '🍞' },
  juice: { name: 'Orange Juice', icon: '🧃' },
  omelette: { name: 'Cheese Omelette', icon: '🧀' },
  cocoa: { name: 'Hot Cocoa', icon: '🍫' },
  waffles: { name: 'Waffles', icon: '🧇' },
  egg_raw: { name: 'Raw Eggs', icon: '🥚' },
  battery: { name: 'AA Batteries', icon: '🔋' },
  blood: { name: 'Blood Bag', icon: '🩸' },
};
// Dishes the Chef Bot knows how to make.
export const CHEF_DISHES = new Set(['eggs', 'pancakes', 'bacon', 'coffee', 'toast', 'juice', 'cocoa', 'waffles']);

// ---------- room tiers ----------
export const TIERS = {
  basic: { name: 'Standard Room', short: 'Standard', price: 1, color: '#8a7a66', icon: '🛏️' },
  suite: { name: 'Suite', short: 'Suite', price: 1.8, color: '#4a6fd0', icon: '🛋️' },
  pres: { name: 'Presidential Suite', short: 'Presidential', price: 4, color: '#e0b04f', icon: '👑' },
};
export const TIER_ORDER = ['basic', 'suite', 'pres'];
export const SUITE_COST = 500;
// How a guest's mood shifts with the room they get, by their taste.
export const TASTE_BONUS = {
  budget: { basic: 0, suite: 6, pres: 10 },
  standard: { basic: 0, suite: 6, pres: 12 },
  luxury: { basic: -10, suite: 6, pres: 14 },
  vip: { basic: -18, suite: -5, pres: 20 },
};
export const TASTE_LABEL = {
  budget: 'Any room will do',
  standard: 'Standard is fine, a suite would be lovely',
  luxury: 'Expects a Suite',
  vip: 'Expects the Presidential Suite',
};
export const TASTE_WANTS = { budget: 'basic', standard: 'basic', luxury: 'suite', vip: 'pres' };

export const MESSES = {
  spill: { name: 'Spill', tool: 'mop', time: 1.3 },
  mud: { name: 'Muddy Footprints', tool: 'mop', time: 1.5 },
  stain: { name: 'Stain', tool: 'mop', time: 1.5 },
  trash: { name: 'Trash', tool: null, time: 0.7 },
  vomit: { name: 'Vomit', tool: 'mop', time: 2.4 },
  blood: { name: 'Blood', tool: 'mop', time: 2.8 },
  slime: { name: 'Alien Slime', tool: 'mop', time: 1.8 },
  ecto: { name: 'Ectoplasm', tool: 'mop', time: 1.8 },
  circle: { name: 'Summoning Circle', tool: 'mop', time: 3.6 },
  debris: { name: 'Pool Gunk', tool: 'net', time: 0.9 },
  bed: { name: 'Unmade Bed', tool: null, time: 2.0 },
  clog: { name: 'Clogged Toilet', tool: 'plunger', time: 2.4 },
  table: { name: 'Dirty Dishes', tool: null, time: 1.1 },
  foam: { name: 'Extinguisher Foam', tool: 'mop', time: 1.2 },
};

export const REQUESTS = {
  towels: { icon: '🧺', label: 'wants fresh towels', time: 1.0 },
  food: { icon: '🛎️', label: 'room service', time: 1.15 },
  clog: { icon: '🪠', label: 'toilet is clogged', time: 1.1 },
  housekeeping: { icon: '🧹', label: 'housekeeping', time: 1.5 },
  noise: { icon: '🔊', label: 'noise complaint', time: 1.0 },
  cold: { icon: '❄️', label: 'wants the room FREEZING', time: 1.0 },
};

export const PLAYER_COLORS = ['#d7263d', '#1b998b', '#f4a259', '#8e6cd8', '#3a86ff', '#9bc53d'];
export const LUGGAGE_COLORS = ['#b23a48', '#2d6a4f', '#1d3557', '#e9c46a', '#6d597a', '#f4a261', '#264653', '#c9184a'];
export const CAR_COLORS = [
  { hex: '#b3202a', name: 'red' }, { hex: '#1d3557', name: 'navy' }, { hex: '#e8e8e8', name: 'white' },
  { hex: '#2a9d8f', name: 'teal' }, { hex: '#e9c46a', name: 'yellow' }, { hex: '#6c757d', name: 'gray' },
  { hex: '#2d6a4f', name: 'green' }, { hex: '#7b2cbf', name: 'purple' }, { hex: '#f4845f', name: 'orange' },
  { hex: '#8d99ae', name: 'silver' },
];
export const CAR_NAMES = { sedan: 'sedan', hatch: 'hatchback', van: 'minivan', pickup: 'pickup', wagon: 'wagon', limo: 'limousine', hearse: 'hearse', black: 'sedan', sports: 'sports car' };

// ---------- archetypes ----------
// size: party size range; members(n): render kinds; food: breakfast menu; req: request weights.
export const ARCH = {
  business: {
    label: 'Business Traveler', taste: 'standard', size: [1, 1], members: () => ['business'], car: 0.75, luggage: [1, 1],
    rate: 140, patience: 1.0, mess: 0.35, pool: 0.12, foodLove: 0.85, speed: 1.35,
    food: ['coffee', 'eggs', 'bacon', 'omelette'], req: { towels: 1, food: 1.3, housekeeping: 0.6, clog: 0.3, noise: 0.9 },
  },
  couple: {
    label: 'Couple', taste: 'standard', size: [2, 2], members: () => ['adult', 'adult'], car: 0.6, luggage: [1, 2],
    rate: 160, patience: 1.05, mess: 0.5, pool: 0.4, foodLove: 0.8,
    food: ['pancakes', 'coffee', 'eggs', 'cocoa', 'omelette'], req: { towels: 1.3, food: 1, housekeeping: 0.8, clog: 0.3, noise: 0.5 },
  },
  tourist: {
    label: 'Tourists', taste: 'budget', size: [1, 3], members: n => Array(n).fill('tourist'), car: 0.35, luggage: [1, 2],
    rate: 130, patience: 1.0, mess: 0.75, pool: 0.5, foodLove: 0.9, messTypes: ['spill', 'trash', 'mud'],
    food: ['pancakes', 'bacon', 'eggs', 'coffee', 'cocoa'], req: { towels: 1, food: 1, housekeeping: 0.6, clog: 0.4, noise: 0.4 },
  },
  retiree: {
    label: 'Retirees', taste: 'standard', size: [1, 2], members: n => Array(n).fill('retiree'), car: 0.8, luggage: [1, 2],
    rate: 150, patience: 0.85, mess: 0.25, pool: 0.3, foodLove: 0.95, speed: 0.8,
    food: ['coffee', 'eggs', 'omelette'], req: { towels: 1.2, food: 0.8, housekeeping: 0.8, clog: 0.6, noise: 1.4 },
  },
  family: {
    label: 'Family', taste: 'budget', size: [3, 5], members: n => ['parent', 'parent', ...Array(n - 2).fill('kid')], car: 0.9, luggage: [2, 3],
    rate: 210, patience: 0.75, mess: 0.8, pool: 0.75, foodLove: 0.9, messTypes: ['spill', 'trash', 'mud', 'trash'],
    food: ['pancakes', 'bacon', 'eggs', 'cocoa'], req: { towels: 1.6, food: 1.1, housekeeping: 1.2, clog: 1.1, noise: 0.3 },
  },
  office: {
    label: 'Synergy Inc.', taste: 'budget', size: [1, 3], members: n => Array(n).fill('office'), car: 0.3, luggage: [0, 1],
    rate: 170, patience: 0.8, mess: 1.1, pool: 0.45, nightOwl: 0.55, foodLove: 0.8, messTypes: ['spill', 'vomit', 'trash', 'trash'],
    food: ['coffee', 'bacon', 'eggs'], req: { food: 1.6, noise: 0.6, clog: 0.9, towels: 0.4, housekeeping: 0.9 },
  },
  boss: {
    label: 'The CEO', taste: 'vip', size: [1, 1], members: () => ['boss'], car: 1, carModel: 'limo', carColor: { hex: '#111111', name: 'black' },
    luggage: [2, 2], rate: 420, patience: 0.6, mess: 0.4, pool: 0.2, reqRate: 1.6, foodLove: 1,
    food: ['coffee', 'omelette'], req: { food: 2, towels: 1.2, housekeeping: 1.2, noise: 1.5 },
  },
  killer: {
    label: 'Quiet Guest', taste: 'standard', size: [1, 1], members: () => ['killer'], car: 1, carModel: 'van', carColor: { hex: '#d9d9d9', name: 'white' },
    luggage: [1, 1], rate: 320, patience: 1.5, mess: 0, pool: 0, reqRate: 0.6, threat: true, speed: 1.05, foodLove: 0.3,
    food: ['coffee'], req: { towels: 2, food: 0.4 },
  },
  alien: {
    label: 'Visitors', taste: 'standard', size: [1, 3], members: n => Array(n).fill('alien'), car: 0, luggage: [0, 1], arrive: 'beam',
    rate: 190, patience: 1.0, mess: 0.9, pool: 0.6, nightOwl: 0.5, foodLove: 0.9, messTypes: ['slime', 'slime', 'trash'],
    food: ['egg_raw', 'battery', 'coffee'], roomService: ['battery', 'egg_raw'], req: { cold: 2.2, food: 1.4, towels: 0.6, clog: 0.4 },
  },
  agent: {
    label: 'Government Agent', taste: 'budget', size: [1, 1], members: () => ['agent'], car: 1, carModel: 'black', carColor: { hex: '#111111', name: 'black' },
    luggage: [1, 1], rate: 150, patience: 0.7, mess: 0, pool: 0, threat: true, foodLove: 0.6,
    food: ['coffee'], req: { food: 1, noise: 1.2 },
  },
  vampire: {
    label: 'Night Folk', taste: 'luxury', size: [1, 2], members: n => Array(n).fill('vampire'), car: 0.7, carModel: 'hearse', carColor: { hex: '#151515', name: 'black' },
    luggage: [1, 2], rate: 260, patience: 1.1, mess: 0.2, pool: 0.25, nightOwl: 0.95, foodLove: 0, vampire: true,
    food: ['blood'], roomService: ['blood'], req: { food: 2.4, towels: 0.3, noise: 0.6 },
  },
  cultist: {
    label: 'The Crimson Book Club', taste: 'budget', size: [2, 4], members: n => Array(n).fill('cultist'), car: 0.4, luggage: [1, 1],
    rate: 150, patience: 1.2, mess: 0.4, pool: 0.1, nightOwl: 0.7, foodLove: 0.7, cult: true,
    food: ['eggs', 'coffee'], req: { food: 0.8, towels: 0.6, clog: 0.4 },
  },
  priest: {
    label: 'The High Priest', taste: 'vip', size: [1, 1], members: () => ['priest'], car: 0, luggage: [0, 0], arrive: 'fade',
    rate: 333, patience: 1.3, mess: 0, pool: 0, threat: true, cult: true, foodLove: 0.5,
    food: ['eggs'], req: { food: 1 },
  },
  ghost: {
    label: 'Guests from 1926', taste: 'luxury', size: [1, 2], members: n => Array(n).fill('ghost'), car: 0, luggage: [1, 2], arrive: 'fade',
    rate: 180, patience: 1.3, mess: 0.6, pool: 0.3, nightOwl: 0.8, foodLove: 0.7, messTypes: ['ecto'], ghost: true,
    food: ['coffee', 'eggs', 'cocoa'], req: { noise: 1.6, towels: 0.6, food: 0.8 },
  },
  influencer: {
    label: 'Influencer', taste: 'luxury', size: [1, 2], members: n => Array(n).fill('influencer'), car: 0.8, carModel: 'sports',
    luggage: [2, 3], rate: 220, patience: 0.75, mess: 0.45, pool: 0.55, foodLove: 0.9, reviewWeight: 2,
    food: ['pancakes', 'coffee', 'juice', 'toast', 'cocoa', 'omelette'], req: { towels: 1.3, food: 1.4, housekeeping: 1.1, noise: 0.6 },
  },
  doppel: {
    label: '???', taste: 'standard', size: [1, 1], members: () => ['doppel'], car: 0, luggage: [0, 0],
    rate: 200, patience: 2, mess: 0, pool: 0, threat: true, foodLove: 0,
    food: ['coffee'], req: {},
  },
};

// ---------- names ----------
const FIRST = ['Dana', 'Alex', 'Jordan', 'Sam', 'Taylor', 'Morgan', 'Chris', 'Pat', 'Jamie', 'Casey', 'Riley', 'Avery',
  'Quinn', 'Robin', 'Terry', 'Leslie', 'Kim', 'Drew', 'Jesse', 'Linda', 'Gary', 'Karen', 'Doug', 'Brenda', 'Frank', 'Marge',
  'Hank', 'Priya', 'Raj', 'Mei', 'Wei', 'Carlos', 'Lucia', 'Omar', 'Fatima', 'Yuki', 'Kenji', 'Olga', 'Ivan', 'Nia', 'Kwame',
  'Siobhan', 'Liam', 'Greta', 'Hans', 'Bob', 'Barb', 'Earl', 'Peggy', 'Dolores', 'Walt', 'Shirley', 'Ned', 'Chad', 'Brad',
  'Kyle', 'Becky', 'Tiffany', 'Trent', 'Skyler', 'Madison', 'Brayden', 'Gus', 'Ingrid', 'Mateo', 'Ama', 'Tomasz'];
const LAST = ['Henderson', 'Patel', 'Garcia', 'Nguyen', 'Smith', 'Kowalski', 'Okafor', 'Yamamoto', 'Rossi', 'Schmidt',
  'Johnson', 'Murphy', 'Larsen', 'Dubois', 'Cohen', 'Ivanova', 'Silva', 'Kim', 'Chen', 'Abbott', 'Pemberton', 'Whitfield',
  'Thornbury', 'Fairweather', 'McAllister', 'Delacroix', 'Haversham', 'Pickering', 'Lindqvist', 'Oduya', 'Brennan', 'Moreau'];
const ALIEN_A = ['Zorp', 'Glim', 'Xan', 'Blorb', 'Kree', 'Vex', 'Quorz', 'Ploob', 'Zzt', 'Mmrk', 'Yib', 'Thrax'];
const ALIEN_B = ['ax', 'ulon', 'ix-7', 'ulus', 'orbo', 'eep', 'zar', 'aa', 'onk'];
const VAMPS = ['Count Vasilescu', 'Countess Marisol', 'Lord Ashgrave', 'Lady Nocturna', 'Baron von Drak', 'Mx. Sanguine', 'Duke Evermore', 'Madame Cripta'];
const CULT = ['Brother Malachi', 'Sister Agatha', 'Brother Thaddeus', 'Sister Mercy', 'Brother Silas', 'Sister Wren'];
const GHOSTS = ['Mr. Archibald Finch', 'Miss Clara Bellweather', 'Mr. & Mrs. Vanderholt', 'Colonel Ashby', 'Miss Dorothy Lark', 'Mr. Percival Quill'];

const person = () => `${pick(FIRST)} ${pick(LAST)}`;
const alienName = () => `${pick(ALIEN_A)}${pick(ALIEN_B)}`;

export function partyName(kind, n) {
  const last = pick(LAST);
  switch (kind) {
    case 'couple': return `${pick(FIRST)} & ${pick(FIRST)} ${last}`;
    case 'family': return `The ${last} Family`;
    case 'tourist': return n > 1 ? `${person()} +${n - 1}` : person();
    case 'retiree': return n > 1 ? `The ${last}s` : `${pick(['Grandma', 'Grandpa', 'Aunt', 'Uncle'])} ${pick(FIRST)}`;
    case 'office': return n > 1 ? `Synergy Inc. (${pick(FIRST)} +${n - 1})` : `${person()}, Synergy Inc.`;
    case 'boss': return 'Chad Brockman, CEO';
    case 'killer': return 'Lyle Ambrose';
    case 'alien': return n > 1 ? `${alienName()} & co.` : alienName();
    case 'agent': return 'Agent [REDACTED]';
    case 'vampire': return pick(VAMPS);
    case 'cultist': return `${pick(CULT)} +${n - 1}`;
    case 'priest': return 'High Priest Obadiah';
    case 'ghost': return pick(GHOSTS);
    case 'influencer': return `@${pick(['glam', 'wander', 'its', 'just', 'living'])}${pick(['with', 'by', '', 'x'])}${pick(FIRST).toLowerCase()}${n > 1 ? ' +1' : ''}`;
    default: return person();
  }
}

// ---------- check-in cards ----------
const NOTES = {
  business: ['Needs a late checkout. Will not get one.', 'Loyalty member (bronze).', 'Will expense everything.', 'Asked for the Wi-Fi password twice.', 'On a call the entire time.'],
  couple: ['Anniversary trip!', 'Honeymooners. Knock loudly.', 'Requested rose petals.', 'Already arguing about the parking.', 'Asked for "the romantic room."'],
  tourist: ['Asked where the beach is. There is no beach.', 'Has 400 photos of the lobby already.', 'Wearing three cameras.', 'Wants a map of the hotel. We are the map.'],
  retiree: ['Asked about the early bird special.', 'Brought their own pillows.', 'Wants a room near the ice machine.', 'Tipped in butterscotch candies.'],
  family: ['Kids: several. Patience: none.', 'Requested a crib and earplugs.', 'Child is holding a frog.', 'Asked if the pool has "a lot of chlorine."', 'Minivan smells like juice boxes.'],
  office: ['Here for mandatory team-building.', 'Company card. Open bar tab.', 'Lanyard says "Synergy Champion."', 'Brought a karaoke machine.', 'Asked if trust falls are covered by insurance.'],
  boss: ['Expects the presidential suite. We have no suite.', 'Refers to staff as "resources."', 'Asked to speak to the manager. You are the manager.'],
  killer: ['Requested: extra plastic sheeting, 6 rolls of duct tape.', 'Luggage: one (1) very heavy hockey bag. No hockey stick.',
    'Occupation: blood spatter analyst (on vacation).', 'Asked which rooms have the thickest walls.', 'Paid in exact change. Smiled for too long.'],
  alien: ['Home planet: "Ohio."', 'Requested room temperature: -40°.', 'Asked to be taken to our leader.', 'Signature is a perfect circle.', 'Has never seen a door before.'],
  agent: ['Employer: [REDACTED].', 'Asked for a list of all guests with antennae.', 'Wearing sunglasses indoors at night.', 'Purpose: "Routine inspection of... tourists."'],
  vampire: ['Check-in after sunset only.', 'Requested blackout curtains. Twice.', 'Does not appear on the security camera.', 'Waited to be invited in.', 'Allergic to garlic, mirrors and Tuesdays.'],
  cultist: ['Requested: 40 candles, chalk, a goat (denied).', 'Luggage: one very old book. It is humming.', 'Said "Hail" instead of "Hello."', 'Booked rooms in a perfect pentagram.'],
  priest: ['Purpose: Ushering in the end of days. Also the continental breakfast.', 'Requested the room directly above the ley line.', 'His eyes glowed while signing.'],
  ghost: ['Reservation dated March 3rd, 1926.', 'Paid with a silver dollar from 1925.', 'Signature fades while you watch.', 'Asked if the band is still playing in the ballroom.'],
  influencer: ['1.2M followers. Will be reviewing.', 'Filming the check-in for "content."', 'Asked for the most "aesthetic" room.', 'Ring light in carry-on.'],
};
const PURPOSE = {
  business: ['Business', 'Conference', 'Sales trip'], couple: ['Getaway', 'Anniversary', 'Wedding'], tourist: ['Sightseeing', 'Road trip'],
  retiree: ['Visiting grandkids', 'Bus tour'], family: ['Family vacation', 'Reunion'], office: ['Team offsite', 'Synergy'],
  boss: ['Inspiring the team'], killer: ['Taking out the trash.', 'Tying up loose ends.'], alien: ['Tourism (human)', 'Research', 'Absolutely normal tourism'],
  agent: ['[REDACTED]'], vampire: ['Nightlife', 'Fine dining'], cultist: ['Book club', 'Retreat'], priest: ['The end times'],
  ghost: ['Still checking in', 'Unfinished business'], influencer: ['Brand partnership', 'Content'],
};
const PAY = {
  alien: ['Warm metal coins', 'A glowing crystal', 'Exact change (alien)'], vampire: ['Ancient gold', 'Doubloons'], ghost: ['Silver dollars (1925)'],
  cultist: ['Cash (damp)'], killer: ['Exact change'], priest: ['Souls (accepted)'], agent: ['Government card'], boss: ['Black Amex'],
};

export function makeCard(kind, party, extra = {}) {
  const normal = !['killer', 'alien', 'agent', 'vampire', 'cultist', 'priest', 'ghost', 'doppel'].includes(kind);
  const res = (normal ? chance(0.85) : chance(0.5)) ? `R-${randi(1000, 9999)}` : null;
  if (kind === 'doppel') {
    return {
      name: party.name, size: party.size, res: null, pay: 'Exact change',
      purpose: 'Visiting myself',
      notes: [extra.dupeRoom ? `Same name as the guest in Room ${extra.dupeRoom}.` : 'Insists they "already checked in."', pick(['Did not blink once.', 'Smile is slightly too wide.', 'Shadow faces the wrong way.'])],
    };
  }
  const notes = [pick(NOTES[kind] || NOTES.business)];
  if (chance(0.5)) { const n2 = pick(NOTES[kind] || NOTES.business); if (n2 !== notes[0]) notes.push(n2); }
  return {
    name: party.name, size: party.size, res,
    pay: pick(PAY[kind] || ['Visa', 'Mastercard', 'Cash', 'Amex', 'Company card', 'Personal check']),
    purpose: pick(PURPOSE[kind] || ['Leisure']), notes,
  };
}

// ---------- surveys ----------
const BAD = {
  wait: ['Stood at the front desk so long I aged a year.', 'Check-in took longer than my flight.', 'The line moved slower than the elevator. And the elevator is broken.', 'Nobody was at the desk. I rang the bell 40 times.'],
  valet: ['The valet never parked my car. It just sat there.', 'Waited forever for my car at checkout.', 'Pretty sure a staff member did donuts in my car.'],
  luggage: ['My suitcase sat in the lobby all night.', 'Had to carry my own bags. Isn\'t that your whole job?'],
  roomDirty: ['The room was filthy.', 'Found someone else\'s sock in my bed.', 'Room smelled like regret.'],
  request: ['Called the front desk. Nobody came. Ever.', 'Asked for towels. Air-dried instead.', 'Requests vanish into the void here.'],
  food: ['Breakfast never came.', 'I could have raised my own chickens faster.', 'Ordered pancakes, received disappointment.'],
  burnt: ['The bacon was charcoal.', 'Who burns pancakes?! Here, apparently.', 'Breakfast was on fire. Literally.'],
  smoke: ['The smoke alarm went off during breakfast. Twice.', 'The kitchen caught fire and the staff just... stood there.', 'Everything smelled like smoke. Even my car.'],
  plates: ['They served my omelette on a napkin.', 'No clean plates? At a HOTEL?'],
  injury: ['My son slipped by the pool and NOBODY came. Expect a letter from our lawyer.', 'Wet floors, no signs, no first aid. One star.'],
  lostkid: ['Our daughter got lost for half an hour and the staff didn\'t lift a finger.', 'Lost our kid in a hedge maze. In the snow. At night. Nobody helped.'],
  locked: ['Locked out of my room and nobody could find a spare key.', 'Slept on a lobby sofa because nobody brought me a key.'],
  drunk: ['Woke up on the hallway carpet. Nobody even brought me a pillow.'],
  elevator: ['The elevator broke and I had to climb the stairs. With my knees.', 'Elevator out of order. Thirty-six stairs to my room. Legs: destroyed.'],
  raccoon: ['There was a RACCOON in the dining room.', 'Shared my breakfast with a raccoon. Not by choice.'],
  vending: ['The vending machine ate my money and nobody cared.'],
  pool: ['The pool was a swamp.', 'Something brushed my leg in the pool. It was a sandwich.', 'Pool water had a texture.'],
  mess: ['The lobby looked like a crime scene. Hopefully not literally.', 'Sticky floors everywhere.', 'Someone threw up in the hallway and it stayed there.'],
  blackout: ['The power went out and stayed out.', 'Spent half the night in total darkness. Heard breathing.'],
  horror: ['THERE WAS BLOOD IN THE HALLWAY.', 'I saw something I can never unsee.', 'Run. Don\'t walk. Run.', 'Something chased us down the hallway.'],
  missing: ['My travel buddy went out for ice and never came back.', 'Has anyone seen my husband? Anyone??', 'We checked in with four. We left with three.'],
  turnedAway: ['Refused service for NO REASON.', 'Turned away at the desk. Rude!', 'They looked me up and down and said no. Unbelievable.'],
  sunlight: ['I BURST INTO FLAMES. One star.', 'Curtains: open. Me: ash.', 'Woke up on fire. Housekeeping did nothing.'],
  harassed: ['A man in a suit interrogated us all night.', 'Bothered by "inspectors" at 2 AM.'],
  bitten: ['Woke up with two holes in my neck.', 'Someone BIT me. In the hallway.'],
  thrown: ['A staff member threw a suitcase at my head.', 'Got hit by a flying mop.', 'Staff throws things. At guests.'],
  privacy: ['Staff barged in despite the DO NOT DISTURB sign.'],
  noise: ['Someone pounded on our door in the middle of the night.'],
  carGone: ['Our car was abducted by a UFO and the valet did NOTHING.', 'Came out to a smoking crater where my car was.'],
  creepy: ['Someone drew satanic symbols in the hallway.', 'The carpet had a pentagram on it. Not a pattern. A pentagram.'],
  room: ['I booked luxury. I got a broom closet with a bed.', 'A STANDARD room? Do you know who I am?', 'The "suite" smelled like a basement.'],
};
const GOOD = {
  general: ['Lovely stay! Would come back.', 'Clean, quick, friendly. Five stars.', 'Honestly better than I expected for this part of the highway.', 'The staff hustled. Respect.', 'Slept like a baby. A happy baby.'],
  fast: ['Check-in took ten seconds. Magic.', 'Staff were lightning fast.'],
  food: ['The pancakes changed my life.', 'Best hotel breakfast I\'ve had.', 'Eggs were perfect. The chef deserves a raise.', 'Hot cocoa after a day in the snow. Perfect.', 'The omelette was fluffy perfection.'],
  waffles: ['The waffles alone are worth the drive up the mountain.', 'Belgian waffles at a mountain lodge? Sold.'],
  care: ['The staff patched up my son in seconds. Heroes.', 'Locked myself out and had a new key in a minute. Wonderful staff.'],
  kid: ['Our little one wandered off and the staff found her in no time. Bless them.'],
  request: ['Asked for towels and had them in a minute!', 'Room service was speedy.'],
  valet: ['Valet parked my car before I hit the door.', 'Car was waiting for me at checkout. Chef\'s kiss.'],
  luggage: ['My bags beat me to the room!'],
  pool: ['Pool was sparkling.'],
  room: ['The suite was GORGEOUS.', 'Felt like royalty in that room.', 'They upgraded us! Best night ever.'],
  spa: ['The hot tub fixed my back. Five stars.'],
  welcome: ['The doorman made me feel like a movie star.'],
  fun: ['The kids lived in the arcade. We finally got some peace.'],
  shopping: ['Bought a snow globe of the hotel. It moves sometimes.'],
};
const MID = ['It was fine.', 'Not bad, not great.', 'Three stars. Would probably survive again.', 'The hotel exists. I stayed in it.', 'Mostly fine. Mostly.'];
const VOICE = {
  alien: {
    good: ['Excellent primitive lodging. 5 of 5 moons.', 'The batteries were delicious. Will return with the fleet.', 'Room temperature: acceptably frozen.'],
    bad: ['Your species disappoints us.', 'Room was a balmy 70°. Practically the surface of a star.', 'We will not be recommending Earth.'],
    mid: ['Earth: adequate.'],
  },
  vampire: {
    good: ['Exquisite. Dark, quiet, and the blood was fresh.', 'I have stayed in castles worse than this.'],
    bad: ['A peasant\'s inn. Ugh.', 'Not a single blood bag in sight.'],
  },
  ghost: {
    good: ['Splendid! Just like it was in \'26.', 'The staff can see us! How modern!'],
    bad: ['The music is dreadful. What is a "Wi-Fi"?', 'Nobody answered our bell. Again. For 98 years.'],
    mid: ['Things were better in my day. Which was 1926.'],
  },
  killer: {
    good: ['Impeccable discretion. I\'ll be back.', 'The staff cleaned up beautifully. Professionals.'],
    bad: ['Sloppy. Very sloppy. Someone will notice.', 'I expected more discretion.'],
  },
  cultist: {
    good: ['The Dark One is pleased. So are we.', 'Lovely acoustics for chanting.'],
    bad: ['Someone kept scrubbing our circles. Rude.', 'The ritual was interrupted by housekeeping.'],
  },
  priest: { good: ['The end times were lovely here.'], bad: ['The apocalypse was postponed. Disappointing.'] },
  agent: { good: ['Inspection complete. Satisfactory.'], bad: ['Suspicious activity everywhere. Filing a report.'], mid: ['Noted.'] },
  doppel: { good: ['WE LOVED IT HERE. WE WILL NEVER LEAVE.', 'Five stars. Five of us. Soon more.'], bad: ['WE WILL REMEMBER THIS.'] },
  boss: { good: ['Adequate. I\'ll let corporate know.'], bad: ['I will be speaking to your manager. Who is also you.'] },
  office: { good: ['10/10 would synergize again.', 'Great offsite. Can\'t remember most of it.'], bad: ['Worse than the quarterly review.'] },
  family: { good: ['The kids LOVED it. We are so tired.', 'Finally, a vacation where nobody cried. Mostly.'], bad: ['Our kids were bored and so were we.'] },
  influencer: {
    good: ['OBSESSED with this place. Link in bio. ✨', 'The lighting here is SO creepy-chic. 10/10.'],
    bad: ['Do NOT stay here, besties. 🚩🚩🚩', 'Unfollowing this hotel. Literally.'],
    mid: ['It was giving... motel.'],
  },
};

function topKey(obj) {
  let best = null, bv = 0;
  for (const k in obj) if (obj[k] > bv) { bv = obj[k]; best = k; }
  return best;
}
const lowerFirst = s => s.charAt(0).toLowerCase() + s.slice(1);

export function surveyText(party, stars, reason) {
  if (reason && BAD[reason]) return pick(BAD[reason]);
  const V = VOICE[party.kind];
  if (stars >= 4) {
    if (V?.good && chance(0.6)) return pick(V.good);
    const pr = topKey(party.praise);
    if (pr && GOOD[pr] && chance(0.7)) return pick(GOOD[pr]);
    return pick(GOOD.general);
  }
  const c = topKey(party.comp);
  if (stars <= 2.5) {
    if (c && BAD[c] && (['horror', 'missing', 'sunlight', 'carGone'].includes(c) || chance(0.7))) return pick(BAD[c]);
    if (V?.bad) return pick(V.bad);
    return c && BAD[c] ? pick(BAD[c]) : pick(MID);
  }
  if (V?.mid && chance(0.5)) return pick(V.mid);
  if (c && BAD[c] && chance(0.65)) return `Decent stay, but ${lowerFirst(pick(BAD[c]))}`;
  return pick(MID);
}

export function satToStars(sat) {
  const s = 1 + 4 * Math.max(0, Math.min(1, (sat - 10) / 80));
  return Math.round(s * 2) / 2;
}

// Lines guests say out loud (speech bubbles).
export const LINES = {
  checkin: ['Thanks!', 'Finally.', 'Which way is the pool?', 'Is breakfast included?', 'Lovely.'],
  angryWait: ['Forget this place!', 'I\'m leaving!', 'Unbelievable.'],
  wrongFood: ['That\'s not what I ordered!', 'Uh... no.', 'I asked for something else.'],
  foodLate: ['Forget it, I\'m not hungry anymore.', 'Still waiting...? Never mind.'],
  bonk: ['OW!', 'HEY!', 'Was that a MOP?!', 'My head!'],
  dnd: ['DO NOT DISTURB!', 'Can you READ the sign?', 'Get OUT!', 'Hello?! We\'re IN here!', 'Do you mind?!'],
  dndWoke: ['You WOKE me up!', 'It\'s the middle of the night!', 'I was ASLEEP!'],
  scared: ['WHAT IS THAT?!', 'AAAAH!', 'NOPE.'],
  knock: ['Fine, fine, we\'ll keep it down.', 'Sorry! Sorry.'],
  snoop: ['Ooh, what\'s back here?', 'Is this the way to the pool?', 'I\'m just looking!', 'Staff only? Says who?'],
  escort: ['Oops! Sorry!', 'My bad, my bad.', 'Fine, FINE.', 'I was never here.'],
  escortKid: ['Awww!', 'But I wanted to see!', 'You\'re no fun.'],
  greet: ['Welcome to The Last Resort.', 'Good evening. Mind the stains.', 'Welcome. Enjoy your stay. Forever.'],
};

// ---------- snooping guests ----------
// Chance weight that a guest wanders into a staff-only area.
export const SNOOP = { kid: 0.6, tourist: 0.3, alien: 0.5, ghost: 0.45, office: 0.3, cultist: 0.5, vampire: 0.35, retiree: 0.12, influencer: 0.35, business: 0.05, adult: 0.06, parent: 0.06, boss: 0.15 };
export const SNOOP_SPOTS = [
  { node: 'kit_c', zone: 'Kitchen', mischief: 'kitchen' },
  { node: 'kit_w', zone: 'Kitchen', mischief: 'kitchen' },
  { node: 'laun_c', zone: 'Laundry', mischief: 'laundry' },
  { node: 'util_c', zone: 'Utility Room', mischief: 'breaker' },
  { node: 'stor_c', zone: 'Storage', mischief: 'basement' },
  { node: 'staff_e', zone: 'Staff Room', mischief: 'snack' },
  { node: 'desk_back', zone: 'Front Desk', mischief: 'tipjar' },
];

// ---------- helpers (automation upgrades) ----------
export const HELPERS = {
  roomba: { name: 'Roomba', job: 'cleaning up' },
  skimmer: { name: 'Pool Bot', job: 'skimming' },
  valet: { name: 'Valet Intern', job: 'parking' },
  bellhop: { name: 'Bellhop Bot', job: 'carrying luggage' },
  housekeeper: { name: 'Housekeeper', job: 'cleaning a room' },
  chef: { name: 'Chef Bot', job: 'cooking' },
  busboy: { name: 'Dish Bot', job: 'clearing tables' },
  towelbot: { name: 'Towel Bot', job: 'delivering towels' },
  electrician: { name: 'Electrician', job: 'fixing the power' },
  guard: { name: 'Night Guard', job: 'patrolling' },
  doorman: { name: 'Doorman', job: 'greeting guests' },
};

// ---------- shifts ----------
// Horror starts on the first night (something at the end of a hallway) and gets real from the second.
export const ROUNDS = [
  {
    title: 'Grand Opening', clientele: 'Regular folks',
    blurb: 'Ski weekends, business trips, a couple of retirees. The road up the mountain closes after dark. What could possibly go wrong?',
    threshold: 2.75, count: 9, mix: { business: 3, couple: 3, tourist: 2, retiree: 2, influencer: 0.6 }, horror: 0.3,
    events: [{ h: 23.4, type: 'flicker', d: 2.5 }, { h: 25.4, type: 'glimpse' }],
  },
  {
    title: 'The Quiet Guest', clientele: 'Regular folks... mostly',
    blurb: 'Someone booked a room and asked for extra plastic sheeting. Read the check-in cards carefully.',
    threshold: 3.0, count: 10, mix: { business: 3, couple: 3, tourist: 2, retiree: 2, influencer: 1 }, horror: 0.5,
    specials: [{ kind: 'killer', h: 16.6 }],
    events: [{ h: 22.5, type: 'flicker', d: 3 }, { h: 23.6, type: 'glimpse' }, { h: 25.0, type: 'murder' }, { h: 27.4, type: 'blackout' }],
  },
  {
    title: 'Family Reunion', clientele: 'Big families',
    blurb: 'Sticky mittens, loud voices and forty-one cousins snowed in together. The pool will never be the same. Nobody has been down to the basement in years.',
    threshold: 3.0, count: 7, mix: { family: 5, couple: 1, retiree: 2 }, horror: 0.6,
    events: [{ h: 23.6, type: 'flicker', d: 3 }, { h: 24.4, type: 'stalker', until: 26.8 }, { h: 25.8, type: 'blackout' }],
  },
  {
    title: 'Synergy Inc. Retreat', clientele: 'A work party',
    blurb: 'A corporate retreat in the mountains. Open bar. Closed minds. Someone is definitely throwing up in the hallway, and something is walking it.',
    threshold: 3.25, count: 11, mix: { office: 8, business: 2, couple: 1 }, horror: 0.65,
    specials: [{ kind: 'boss', h: 17.2 }],
    events: [{ h: 23.4, type: 'stalker', until: 27.8 }, { h: 24.4, type: 'blackout' }, { h: 26.5, type: 'flicker', d: 4 }],
  },
  {
    title: 'They Come in Peace', clientele: 'Visitors from "Ohio"',
    blurb: 'A tour group with antennae has booked most of the hotel. It is already ten below outside. They want their rooms colder.',
    threshold: 3.25, count: 10, mix: { alien: 7, tourist: 2, business: 1 }, horror: 0.7,
    specials: [{ kind: 'agent', h: 18.4 }],
    events: [{ h: 23.0, type: 'flicker', d: 3 }, { h: 24.6, type: 'ufo' }, { h: 24.9, type: 'interrogate' }, { h: 25.6, type: 'stalker', until: 27.6 }, { h: 27.3, type: 'ufo' }],
  },
  {
    title: 'Midnight Society', clientele: 'Vampires & a "book club"',
    blurb: 'Very pale guests who only check in after dark, and a club that brought a lot of chalk. Close the curtains before sunrise.',
    threshold: 3.5, count: 10, mix: { vampire: 4, cultist: 4, couple: 2 }, horror: 0.85,
    specials: [{ kind: 'priest', h: 19.0 }],
    events: [{ h: 23.5, type: 'circles' }, { h: 25.2, type: 'blackout' }, { h: 26.6, type: 'ritual' }, { h: 28.6, type: 'curtains' }, { h: 30.0, type: 'sunrise' }],
  },
  {
    title: 'Checkout Is Forever', clientele: 'The hotel\'s oldest guests',
    blurb: 'The blizzard has cut the phone lines. Guests from 1926. Guests who look exactly like other guests. And something has come up from the basement.',
    threshold: 3.5, count: 11, mix: { ghost: 4, business: 2, couple: 2, family: 2, tourist: 1 }, horror: 1.0,
    specials: [{ kind: 'doppel', h: 20.5 }, { kind: 'doppel', h: 22.6 }],
    events: [{ h: 23.4, type: 'stalker', until: 29.6 }, { h: 24.6, type: 'blackout' }, { h: 26.0, type: 'replace' }, { h: 27.6, type: 'blackout' }],
  },
];

const THEMES = [
  { mix: { business: 2, couple: 2, tourist: 2 } },
  { mix: { family: 3 } },
  { mix: { office: 4 }, specials: [{ kind: 'boss', h: 17.5 }] },
  { mix: { alien: 4 }, events: [{ h: 24.8, type: 'ufo' }] },
  { mix: { vampire: 2, cultist: 2 }, events: [{ h: 23.5, type: 'circles' }, { h: 28.6, type: 'curtains' }, { h: 30, type: 'sunrise' }] },
  { mix: { ghost: 3 } },
  { mix: { retiree: 2, couple: 1 }, specials: [{ kind: 'killer', h: 17 }], events: [{ h: 25.5, type: 'murder' }] },
];

export function endlessRound(n) {
  const a = pick(THEMES);
  let b = pick(THEMES);
  if (b === a) b = THEMES[(THEMES.indexOf(a) + 1) % THEMES.length];
  const mix = { ...a.mix };
  for (const k in b.mix) mix[k] = (mix[k] || 0) + b.mix[k];
  const events = [...(a.events || []), ...(b.events || []), { h: 24 + rand(0, 3), type: 'blackout' }];
  if (chance(0.6)) events.push({ h: 23.5, type: 'stalker', until: 29.5 });
  return {
    title: `Overtime #${n - ROUNDS.length}`, clientele: 'A bit of everything',
    blurb: 'The hotel is famous now. Everyone wants a room. Everyone.',
    threshold: Math.min(4.2, 3.5 + 0.1 * (n - ROUNDS.length)), count: 12, mix, horror: 1,
    specials: [...(a.specials || []), ...(b.specials || []), ...(chance(0.5) ? [{ kind: 'doppel', h: 21.5 }] : [])],
    events,
  };
}

// ---------- upgrades ----------
// Build: one-off construction. Hotel: general upgrades with five levels; every level is a step up in
// what the upgrade does (`each`) and brings the perk it's named after. Hired Help: hire a helper, then
// train them twice (faster at everything; some get a second pair of hands).
export const UPGRADE_CATS = [
  { id: 'build', name: 'Build', icon: '🏗️' },
  { id: 'hotel', name: 'Hotel', icon: '⭐' },
  { id: 'help', name: 'Hired Help', icon: '🤖' },
];

// helper: true means a visible NPC or robot appears in the hotel and does the job.
export const UPGRADES = [
  // build
  { id: 'floor2', cat: 'build', name: 'Second Floor', icon: '🏗️', desc: 'Builds a new storey on top of the hotel: 12 more guest rooms (201–212) and a supply closet, reached by the elevator and a staircase at the west end of the hall. More rooms means more guests and more money.', cost: [2400] },
  { id: 'floor3', cat: 'build', name: 'Third Floor', icon: '🏗️', desc: 'Another storey: rooms 301–312 and the Lounge, with a roaring fire guests love to sit by.', cost: [3400], req: 'floor2' },
  { id: 'pres', cat: 'build', name: 'Presidential Suite', icon: '👑', desc: 'A palatial suite at the end of the second floor. VIPs pay 4× and adore it.', cost: [2800], req: 'floor2' },
  { id: 'suites', cat: 'build', name: 'Suite Renovations', icon: '🛋️', desc: `Turn standard rooms into suites ($${SUITE_COST} each) from the Hotel tab. Suites pay 1.8×.`, cost: [], hotelTab: true },
  // hotel: five levels each
  {
    id: 'desk', cat: 'hotel', name: 'Front Desk', icon: '🛎️', each: 'Guests wait 12% longer at the desk and arrive a little happier.',
    cost: [350, 700, 1200, 1900, 2800],
    levels: [
      ['Smooth Jazz Muzak', 'Something soothing for the queue.'],
      ['Lobby Makeover', 'Rugs, plants and a fresh coat of paint.'],
      ['Express Checkout', 'A key drop box: checking-out guests skip the desk.'],
      ['Grand Lobby', 'Chandeliers, and a jar of welcome cookies at the desk.'],
      ['Self Check-in Kiosk', 'Guests with reservations check themselves in. It does not read the notes.'],
    ],
    perks: [[], ['lobby1'], ['express'], ['lobby2', 'cookies'], ['kiosk']],
  },
  {
    id: 'rooms', cat: 'hotel', name: 'Guest Rooms', icon: '🛏️', each: 'Every guest checks out a little happier and pays $6 more.',
    cost: [300, 650, 1100, 1800, 2700],
    levels: [
      ['Luxury Bedding', 'Thick mattresses and far too many pillows.'],
      ['Minibars', 'Overpriced snacks in every room: +$15 a stay, +$40 in suites.'],
      ['Soundproofing', 'Noise complaints are 70% rarer.'],
      ['Self-Cleaning Toilets', 'Toilets clog half as often.'],
      ['Automatic Curtains', 'Every curtain closes itself at 5 AM. The night folk sleep safe.'],
    ],
    perks: [['bedding'], ['minibar'], ['soundproof'], ['toilets'], ['curtains']],
  },
  {
    id: 'cooking', cat: 'hotel', name: 'Kitchen', icon: '🍳', each: 'Food cooks 10% faster and takes 20% longer to burn.',
    cost: [300, 650, 1100, 1800, 2700],
    levels: [
      ['Serving Trays', 'Carry up to 3 dishes at once (always on in the Advanced kitchen).'],
      ['Espresso Machine', 'Instant coffee, and guests love it.'],
      ['Island Cooktop', 'Four more burners on the kitchen island.'],
      ['Waffle Iron', 'Waffles go on the menu for anyone who likes pancakes. Guests tip well for them.'],
      ['Fire Suppression Hood', 'Stove fires put themselves out after a few seconds, and heat lamps keep cooked food from burning.'],
    ],
    perks: [['trays'], ['espresso'], ['stove2'], ['waffle'], ['suppress', 'warmers']],
  },
  {
    id: 'cleaning', cat: 'hotel', name: 'Housekeeping', icon: '🧹', each: 'Mopping, plunging, skimming and making beds go 15% faster.',
    cost: [250, 550, 950, 1600, 2400],
    levels: [
      ['Extra Supplies', 'Two more mops, a pool net and a plunger stashed around the hotel.'],
      ['Laundry Chute', 'A towel cabinet in the main hallway.'],
      ['Pool Chlorinator', 'Pool gunk builds up 40% slower.'],
      ['Dishwasher', 'Washes the dishes piled in the sink by itself, one tub at a time.'],
      ['Industrial Mop Heads', 'Mopping goes twice as fast.'],
    ],
    perks: [['supplies'], ['chute'], ['chlorine'], ['dishwasher'], ['mop']],
  },
  {
    id: 'gear', cat: 'hotel', name: 'Staff Gear', icon: '👟', each: 'Staff walk 5% faster and have more stamina.',
    cost: [250, 550, 950, 1600, 2400],
    levels: [
      ['Squeaky Sneakers', 'Light on your feet. Loud in the hallways.'],
      ['Luggage Cart Wheels', 'Suitcases no longer slow you down, and guests wait longer for them.'],
      ['Energy Drinks', 'A fridge full of them in the staff room. Stamina comes back much faster.'],
      ['Roller Skates', 'Sprinting is 25% faster.'],
      ['Marathon Training', 'You barely get winded.'],
    ],
    perks: [[], ['cart'], ['energy'], ['skates'], []],
  },
  {
    id: 'security', cat: 'hotel', name: 'Security', icon: '🔦', each: 'Flashlights drive monsters back 15% quicker.',
    cost: [350, 700, 1200, 1900, 2800],
    levels: [
      ['Backup Generator', 'Blackouts end by themselves after 20 seconds.'],
      ['Security Cameras', 'Blood, bodies and anything you\'ve spotted show up on the map.'],
      ['Background Checks', 'Suspicious guests get a red FLAGGED stamp on their check-in card.'],
      ['Garlic & UV Lamps', 'Monsters are 30% slower and fade sooner, summoning circles charge slower, and vampires never bite.'],
      ['Salt Lines', 'Monsters cannot enter guest rooms. Hide in one!'],
    ],
    perks: [['generator'], ['cameras'], ['background'], ['garlic', 'uv', 'holy'], ['salt']],
  },
  {
    id: 'amenities', cat: 'hotel', name: 'Amenities', icon: '🎁', each: 'Room rates go up 4%.',
    cost: [300, 650, 1100, 1800, 2700],
    levels: [
      ['Snack Machines', 'Guests buy snacks by the elevators (+$4 each).'],
      ['Highway Billboard', '20% more guests book a room.'],
      ['Gift Shop', 'Guests browse and buy souvenirs (+$5–20 each).'],
      ['Arcade Corner', 'Kids play arcade games instead of making messes or snooping.'],
      ['Hot Tub', 'Guests soak in the pool hall hot tub (+5 happiness).'],
    ],
    perks: [['vending'], ['billboard'], ['giftshop'], ['arcade'], ['spa']],
  },
  // hired help: hire, then train twice
  { id: 'bellhop', cat: 'help', name: 'Bellhop Bot', icon: '🧳', desc: 'A robot carries luggage up to rooms.', cost: [750, 1050, 1500], helper: true, levels: ['One robot.', 'A second robot.', 'Both roll 25% faster.'] },
  { id: 'valet', cat: 'help', name: 'Valet Intern', icon: '🅿️', desc: 'An intern parks cars that wait too long, and fetches them at checkout.', cost: [650, 900, 1300], helper: true, levels: ['One intern.', 'Faster.', 'Faster still.'] },
  { id: 'doorman', cat: 'help', name: 'Doorman', icon: '🎩', desc: 'Greets arriving guests and walks snooping guests out of staff areas.', cost: [600, 850, 1250], helper: true, levels: ['A warm welcome (+2).', 'A warmer one (+3), and quicker on his feet.', 'A red-carpet welcome (+4).'] },
  { id: 'chef', cat: 'help', name: 'Chef Bot', icon: '🤖', desc: 'Cooks and serves simple orders. Slowly. Very slowly.', cost: [1000, 1400, 2000], helper: true, levels: ['Slowly.', 'Less slowly.', 'Almost quickly.'] },
  { id: 'busboy', cat: 'help', name: 'Dish Bot', icon: '🍽️', desc: 'Clears dirty tables in the dining room.', cost: [550, 800, 1150], helper: true, levels: ['One robot.', 'Faster.', 'Faster still.'] },
  { id: 'roomba', cat: 'help', name: 'Roomba Swarm', icon: '🧹', desc: 'Little robots roam the lobby and hallways cleaning messes.', cost: [600, 850, 1250], helper: true, levels: ['Two robots.', 'Three robots, and faster.', 'Four robots, and faster still.'] },
  { id: 'skimmer', cat: 'help', name: 'Pool Bot', icon: '🏊', desc: 'A robot paddles around skimming the pool.', cost: [500, 750, 1100], helper: true, levels: ['One robot.', 'Faster.', 'Faster still.'] },
  { id: 'housekeeper', cat: 'help', name: 'Housekeeper', icon: '🧹', desc: 'Cleans dirty rooms and answers housekeeping calls.', cost: [900, 1250, 1800], helper: true, levels: ['One housekeeper.', 'A second housekeeper.', 'Both 25% faster.'] },
  { id: 'towelbot', cat: 'help', name: 'Towel Bot', icon: '🧺', desc: 'Delivers towel requests.', cost: [650, 900, 1300], helper: true, levels: ['One robot.', 'Faster.', 'Faster still.'] },
  { id: 'electrician', cat: 'help', name: 'Electrician', icon: '👷', desc: 'Walks to the breaker and fixes blackouts.', cost: [650, 900, 1300], helper: true, levels: ['One electrician.', 'Faster.', 'Faster still.'] },
  { id: 'guard', cat: 'help', name: 'Night Guard', icon: '💂', desc: 'Patrols at night, stuns monsters with his flashlight and walks snoops out.', cost: [950, 1300, 1900], helper: true, levels: ['One guard.', 'Faster.', 'Faster still.'] },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));
// The perks that come with levels of the Hotel upgrades: perk → [upgrade id, level].
export const PERK_OF = {};
for (const u of UPGRADES) u.perks?.forEach((ks, i) => { for (const k of ks) PERK_OF[k] = [u.id, i + 1]; });
// Whether a perk is on, given the upgrade levels (sim.upgrades, or snap.up on a client).
export const hasPerk = (up, k) => !!PERK_OF[k] && (up?.[PERK_OF[k][0]] || 0) >= PERK_OF[k][1];
// How long a mess takes to clean, with the hotel's Housekeeping level (and its mop heads).
export function cleanTime(t, up) {
  const def = MESSES[t];
  return (def.time / (1 + 0.15 * (up?.cleaning || 0))) * (def.tool === 'mop' && hasPerk(up, 'mop') ? 0.5 : 1);
}
