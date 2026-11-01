# The Last Resort

A 3D co-op hotel horror game for 1–6 players, playable in the browser.

You and your friends are the entire staff of a lodge at the top of a lonely mountain road. When the snow comes,
nobody gets in or out. You work the front desk, park cars, haul luggage, cook breakfast, deliver towels, mop up
whatever the guests leave behind, skim the pool and get the power back on. Every guest fills out a survey when they
leave. If the shift's average rating drops below the target, corporate shuts you down. Pass, and corporate sends
money for upgrades.

Each shift brings a stranger clientele, starting with business travelers and ending with something that walks up
from the basement. Nobody will warn you when it's here: you'll hear it before you see it.

## Running it

You need [Node.js](https://nodejs.org) 18 or newer.

- **Windows:** double-click `start.bat`. It installs dependencies the first time, starts the server and opens
  your browser.
- **Anywhere:**
  ```
  npm install
  npm start
  ```
  Then open <http://localhost:3000>.

Chrome, Edge and Firefox all work. Click the game window to capture the mouse, and press Esc to pause or free it.

## Playing with friends

1. One person runs the server, picks a difficulty and clicks **Host co-op**. A 4-letter room code appears.
2. Friends open the hotel in their browser and enter the code under **Join a friend**.
   - **Same Wi-Fi/LAN:** the server window prints a `Friends on LAN: http://192.168.x.x:3000` address. Friends
     open that address.
   - **Over the internet:** expose port 3000. Options include forwarding the port on your router, running a
     tunnel such as `npx localtunnel --port 3000` or Cloudflare Tunnel, or deploying the folder to any Node host
     (Render, Railway, Fly.io). The server serves the game and the multiplayer relay on the same port.
3. The host's browser runs the hotel. If the host closes the tab, the shift ends for everyone.

There's text chat (press **T**) and pings (press **G** to mark the spot you're looking at for everyone).
For voice, use Discord.

## Difficulty

The host picks a preset on the main menu (Chill, Normal, Hard, Nightmare) and can fine-tune it between shifts
under **Manager's Office → Difficulty**:

| Option | What it changes |
| --- | --- |
| Guests per shift | How many parties book a room |
| Guest patience | Every timer: the desk queue, luggage, requests, breakfast, valet |
| Kitchen | Simple (food never burns, no dishes to wash), Normal (omelettes, fires, dishes), Advanced (adds toast, juice and two-dish combo orders; food burns fast and fires spread faster; serving trays help) |
| Messes | How often guests and the pool make a mess |
| Horror | Monster speed, flicker, extra blackouts on the scary shifts |
| Rating targets | Adds to or takes from every shift's target |
| Crew scaling | How much harder the hotel gets for each extra staff member |
| Shift length | 5, 8 or 12 minutes |

**More staff means a harder hotel.** With crew scaling on Normal, a solo player gets about half the guests, more
patient guests and fewer messes; each extra player adds guests and trims patience. Brutal scaling also raises the
rating target for every extra player. Off makes the hotel the same no matter how many of you there are.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Shift | Sprint (uses stamina) |
| Space | Jump (in a car: brake) |
| E / Left click | Interact. Hold it for chores (mopping, making beds, the breaker). |
| Q | Drop what you're holding |
| Right click | Throw what you're holding (guests do not like this) |
| F | Flashlight |
| G | Ping a spot for your crew |
| R | Point the ◆ waypoint at the next job |
| M | Full map |
| T | Chat |
| Tab | Manager's Office between shifts |
| Enter | Host only: start the next shift |
| 1 / 2 / 3 | At the front desk: check in to a Standard room / Suite / the Presidential Suite (check-out: 1) |
| X | At the front desk: turn the guest away |
| E at the elevator | Ride to another floor (1 / 2 / 3 picks the floor) |
| H | Honk (while driving) |
| Esc | Pause and settings (sensitivity, FOV, graphics, film grain, reduce flashing) |

## The job

Everything that needs doing appears in the task list on the right (with how far away it is), as icons on the
minimap, and the most urgent job gets a ◆ marker on screen.

- **Front desk:** go behind the counter and press E at the computer. Read the check-in card, then pick a room
  type or turn the guest away. Each card says what kind of room the guest expects: fancy guests are happier in a
  suite, and grumpy if you hand them a plain room while a suite sits empty.
- **Valet:** cars stop under the canopy. Drive them into a marked spot in the lot, and bring them back when the
  owner checks out.
- **Luggage:** suitcases appear next to the desk. Carry them into the guest's room.
- **Requests:** towels (Laundry), room service (Kitchen), clogged toilets (plunger), noise complaints (knock on
  the noisy room's door), housekeeping.
- **Breakfast:** take ingredients from the fridge, cook them on the stove (don't let them burn), and serve the
  guest at their table. Bread goes in the toaster, juice comes from the juicer and hot cocoa from the copper pot.
  The tickets over the pass list every open order.
  - **Omelettes:** put raw eggs on a burner, then bring cheese from the fridge and press E on the pan while they
    cook.
  - **Fires:** burnt food left on a burner catches fire, and the fire spreads along the range. Smoke and the alarm
    upset everyone in the dining room. The fire extinguisher stands at the end of the island; hold E on the flames,
    then mop up the foam.
  - **Dishes:** clearing a table hands you a tub of dirty dishes. Drop it in the sink and hold E to wash it. Cooked
    food needs a clean plate to come off the stove, and there are only twelve, so keep washing.
  - **The pass:** the hatch between the kitchen and the dining room. Set plates on it from the kitchen and a
    teammate can pick them up from the dining room side.
- **Cleaning:** mops, the pool net and plungers hang on the SUPPLIES rack in the lobby. Dirty rooms need the bed
  made and the mess cleaned before anyone can check in.
- **Do Not Disturb:** guests settling into their room usually hang a DO NOT DISTURB card on the door handle, and
  always do when they go to sleep. A red light glows beside the door, the room shows a red dot on the map and the
  lobby status board says DND. Walk in on them and they're furious, more so if you wake them; knocking annoys them
  too. Clean that room once they head out. The sign comes down when they leave or call for housekeeping.
- **Staff-only areas:** the kitchen, laundry, utility room, staff room, storage and the back of the front desk.
  Guests walk around them, but nosy ones (kids especially) wander in. Walk up and press E to escort them out
  before they burn the food, flip the breaker or open the basement door.
- **Power:** when the lights die, the breaker is in the Utility Room at the west end of the hallway.
- **Upstairs:** once you've built more floors, take the elevator at the north end of the lobby hallway, or the
  staircase along the hallway's north wall at its west end: a straight flight up to a landing at the end of the hall
  upstairs, with a banister round the opening (the next flight up starts back at the foot of that opening). Guests,
  helpers and monsters use the stairs too, whichever way is quicker. Each floor has a linen closet (towels) and a
  housekeeping closet (a mop and a plunger). Jobs on other floors show ↑2F or ↑3F instead of a distance.

### Things that go wrong

Every minute or two something happens that needs a person, with a timer on the task list. Sort it out in time and
the guests are grateful; let it run out and it ends up in their review.

| Incident | What to do |
| --- | --- |
| 🤕 A kid (or anyone) slips on the wet pool deck | Grab a first aid kit (beside the mops on the lobby's back wall, or by the nets on the pool room's back wall) and hold E on them |
| 😰 A kid wanders off (the hedge maze, the laundry, the storage room by the basement door...) | Follow the marker, find them, press E to send them back |
| 🚪 A guest locks themselves out | Take a spare key card from the rack behind the front desk and hand it over |
| 🥴 An office partier passes out in public | Hold E to get them up and off to bed, or they're sick where they lie |
| 🛗 The elevator gets stuck | Hold E at the elevator panel on the ground floor; until then everyone takes the stairs |
| 🦝 A raccoon gets into the kitchen | Hold E on it with a mop to chase it out before it raids the trash and the stove |
| 🥤 The vending machine eats a guest's money | Hold E on the machine to give it a whack |

A wet pool deck makes slips likelier. Lockouts, lost kids and the vending machine only go on the list once the guest
has actually got to their door, wandered off to wherever they went, or fed the machine.

### Closing time

A shift no longer ends just because the clock runs out. At noon (or once the last guest has left after breakfast)
the clock stops and the hotel closes up: the shift ends only when every guest is gone and the task list is empty.
A banner shows how many jobs are left. If nobody finishes within eight minutes, corporate's cleaners take over and
bill you for the leftovers.

## Growing the hotel

Between shifts, the Manager's Office has four tabs:

- **Upgrades:** three kinds, and they don't come cheap, so pick what your crew needs most.
  - **Build:** the Second and Third Floors, the Presidential Suite and suite renovations.
  - **Hotel:** seven general upgrades that each go up five levels. Every level improves the whole thing a little
    and brings the perk it's named after:

    | Upgrade | Every level | Perks, level 1 → 5 |
    | --- | --- | --- |
    | 🛎️ Front Desk | guests wait 12% longer, arrive happier | muzak, lobby makeover, express checkout, grand lobby & cookies, self check-in kiosk |
    | 🛏️ Guest Rooms | happier checkouts, +$6 a stay | luxury bedding, minibars, soundproofing, self-cleaning toilets, automatic curtains |
    | 🍳 Kitchen | cooks 10% faster, burns 20% slower | serving trays, espresso machine, island cooktop, waffle iron, fire suppression hood |
    | 🧹 Housekeeping | cleaning 15% faster | extra supplies, laundry chute, pool chlorinator, dishwasher, industrial mop heads |
    | 👟 Staff Gear | walk 5% faster, more stamina | sneakers, luggage cart wheels, energy drinks, roller skates, marathon training |
    | 🔦 Security | flashlights 15% stronger | backup generator, security cameras, background checks, garlic & UV lamps, salt lines |
    | 🎁 Amenities | room rates +4% | snack machines, highway billboard, gift shop, arcade, hot tub |

  - **Hired Help:** hire a robot or a person, then train them twice (faster, and for the Bellhop Bot, Housekeeper
    and Roomba swarm, more of them).
- **Hotel:** a floor plan, storey by storey. Build a **Second Floor** and a **Third Floor** on top of the hotel (12
  rooms each, reached by the elevator; the third floor adds the Lounge, where guests warm up by the fire), add the
  **Presidential Suite** at the end of the second floor, and click any standard room to renovate it into a
  **suite**. More rooms bring more guests and more money; suites pay 1.8× and the Presidential Suite 4×.
- **Difficulty:** the settings above.
- **Crew:** who's on shift and which helpers you've hired.

Hired help is a visible robot or person in the hotel who does the job themselves: Roomba
swarm, Pool Bot, Valet Intern, Bellhop Bot, Housekeeper, Chef Bot, Dish Bot, Towel Bot, Electrician, Night Guard
and Doorman. The Chef Bot can make cocoa and waffles but not omelettes, and the Dish Bot washes up when there are no
tables to clear. Walk up to one to see what it's working on; jobs a helper has already taken are tagged 🤖 in the task
list so the crew can do something else.

## The shifts

| # | Shift | Clientele | Target |
| --- | --- | --- | --- |
| 1 | Grand Opening | Regular folks (and an influencer whose review counts double). Was somebody standing at the end of the hall? | ★ 2.75 |
| 2 | The Quiet Guest | Regular folks... and one very polite man with a lot of plastic sheeting | ★ 3.00 |
| 3 | Family Reunion | Big families with sticky kids, and something from the basement | ★ 3.00 |
| 4 | Synergy Inc. Retreat | A work party, plus the CEO, plus whatever is walking the halls | ★ 3.25 |
| 5 | They Come in Peace | Aliens who want their rooms freezing, plus a government agent | ★ 3.25 |
| 6 | Midnight Society | Vampires and a "book club" that brought chalk | ★ 3.50 |
| 7 | Checkout Is Forever | Guests from 1926, guests who look like other guests, and the Night Porter | ★ 3.50 |

Targets shown are for the Normal preset. After shift 7 you can keep going in endless Overtime.

Some horror tips, if you want them:

- Nothing announces itself. A monster goes on the task list only once one of you has seen it, and blood or a body
  only once someone has found it (security cameras help). Before that, listen for slow footsteps and watch for
  the lights stuttering.
- Monsters hunt whoever they can see. Shine your flashlight at them, or break line of sight and run.
- Read the check-in cards. Some guests should not be let in, and turning them away is the right call.
- Guests who see blood or a body flee and leave a 1-star review. The dumpster is outside, west of the entrance.
- Close the curtains in vampire rooms before 6 AM.

## Project layout

```
server.js            static file server + WebSocket relay for co-op rooms
public/index.html    page, HUD markup and the main menu
public/style.css     all styling
public/src/
  main.js            bootstrap, game loop, settings, pings, glue between sim/network/rendering
  sim.js             the host-side simulation (guests, tasks, ratings, room tiers, horror events)
  helpers.js         the hired robots and staff (mixed into the simulation)
  difficulty.js      difficulty presets, options and crew-size scaling
  content.js         guest types, names, check-in cards, survey lines, shifts, upgrades
  layout.js          floor plan (every storey), colliders, interactables, room decor and the nav graph
  world.js           builds the hotel and drives doors, lights, the sky, upgrade fixtures and room decor
  props.js           furniture, fixtures and the hotel frontage
  models.js          guests, staff, helpers, monsters, items, messes, cars, the UFO
  looks.js           how each guest looks (deterministic from a seed)
  view.js            turns simulation snapshots into moving 3D objects
  player.js          first-person controller and valet driving
  interact.js        targeting, prompts and actions
  hud.js             HUD, minimap, waypoint, check-in card and the Manager's Office
  audio.js           procedurally synthesized sound
  net.js             networking client
test/                headless tests and balance bots (npm test)
```

Every model, texture and sound is generated in code, so the game ships no asset files.

Upper floors are laid out side by side with the ground floor in the simulation (1000 m apart) and lifted into
place when drawn, so the simulation stays 2D. `toWorld()` in `layout.js` does the lift. Floors connect by the
elevator (a short wait, then a jump) and by the staircase: the flights stack in one slot, the walkable height there
comes from `surfaceY()` (the highest flight within a step of your feet), and halfway up a flight a walker's position
switches to the next floor's coordinates at the same spot in the building.

NPCs plan routes with `planPath()`: A* over the nav graph between whichever nearby nodes they can actually walk to
in a straight line, measured in real distances (the check-in line costs extra to walk through), then straightened
wherever a straight line is clear. While walking they round corners, and step around each other and the crew.

## Tuning

- Shift lineups, rating targets, guest types, room tiers, upgrade prices and perks are in `public/src/content.js`
  (what each Hotel upgrade level adds is applied where it's used in `sim.js`, with `cleanTime()` shared).
- Difficulty presets and the crew-size tables are in `public/src/difficulty.js`.
- Timers (patience, luggage, requests, breakfast) and complaint caps are at the top of `public/src/sim.js`;
  helper speeds, counts and training are at the top of `public/src/helpers.js`.
- `npm test` checks the navigation graph (including that guests never route through staff areas), difficulty
  settings, expansions and helpers, and plays every shift with bots, including "human-speed" bots that pay
  walking time for every trip. Run it after changing balance numbers to see how the curve moves.
