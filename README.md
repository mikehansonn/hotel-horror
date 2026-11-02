# The Last Resort

A 3D co-op hotel horror game for 1–6 players, playable in the browser.

You and your friends are the new staff of The Last Resort, an old hotel at the top of a lonely mountain road. When
the snow comes, nobody gets in or out. You work the front desk, answer the phone, park cars, haul luggage, cook
breakfast, mop up whatever the guests leave behind and keep the lights on.

The owner, Mr. Harrow, leaves a letter on the break room corkboard before every shift and rings the front desk when
something is wrong. He reads every review. His rules are simple: the guests come first, keep the lights on, and the
door at the back of Storage stays locked. It goes down to the basement, where his father's night porter went to see
to the boiler one night in the winter of 1926.

Every guest fills out a survey when they leave. If the shift's average rating drops below the target, Mr. Harrow
lets you go. Pass, and he pays you, and the money goes on upgrades. Each night the guests get stranger and the
knocking from the basement gets louder, and sooner or later somebody has to go down there. Nobody will warn you when
something is loose in the halls: you'll hear it before you see it.

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

The host picks a preset on the main menu (Chill, Normal, Hard, Nightmare) and can fine-tune it between shifts at
the **terminal in the break room → Difficulty**:

| Option | What it changes |
| --- | --- |
| Guests per shift | How many parties book a room |
| Guest patience | Every timer: the desk queue, the phone, luggage, requests, breakfast, valet |
| Kitchen | Simple (food never burns, no dishes to wash), Normal (omelettes, fires, dishes), Advanced (adds toast, juice and two-dish combo orders; food burns fast and fires spread faster; serving trays help) |
| Messes | How often guests and the pool make a mess |
| Horror | Monster speed, flicker, extra blackouts on the scary shifts |
| Rating targets | Adds to or takes from every shift's target |
| Crew scaling | How much harder the hotel gets for each extra staff member |
| Shift length | 5, 8 or 12 minutes |

**More staff means a harder hotel.** With crew scaling on Normal, a solo player gets about half the guests, more
patient guests, fewer messes and fewer phone calls; each extra player adds guests, calls and messes and trims
patience. Brutal scaling also raises the rating target for every extra player. Off makes the hotel the same no
matter how many of you there are.

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
| Enter | Host only, in the break room: start the next shift right away |
| 1 / 2 / 3 | At the front desk: check in to a Standard room / Suite / the Presidential Suite (check-out: 1) |
| X | At the front desk: turn the guest away |
| E at the elevator | Ride to another floor (1 / 2 / 3 picks the floor) |
| A / D or ← / → | At the security monitors: switch cameras |
| 1 – 4 | At the security monitors: flash that camera |
| H | Honk (while driving) |
| Esc | Pause and settings (sensitivity, FOV, graphics, film grain, reduce flashing) |

## The break room

Every shift starts and ends in the break room, at the east end of the hallway. Mr. Harrow's letter for the night is
pinned to the corkboard (press E to read it), and the terminal by the door is where you spend the money (see
[Growing the hotel](#growing-the-hotel)). The shift begins once everyone has been in the break room and walked back
out into the hotel; the host can press Enter to start it straight away. When the shift is over, the crew heads back
to the break room for the results, the next letter and the shopping.

## The job

Everything that needs doing appears in the task list on the right (with how far away it is), as icons on the
minimap, and the most urgent job gets a ◆ marker on screen.

- **Front desk:** go behind the counter and press E at the computer. Read the check-in card, then pick a room
  type or turn the guest away. Each card says what kind of room the guest expects: fancy guests are happier in a
  suite, and grumpy if you hand them a plain room while a suite sits empty.
- **The phone:** guests don't come down to ask for things, they ring the front desk. The phone sits on the desk
  (there's an extension in the Security Office); press E to answer. Whatever they want only goes on the task list
  once somebody picks up, and a guest who lets it ring out hangs up annoyed. Mr. Harrow calls too, and late at night
  the old line to Room 000 rings. There is no Room 000.
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
- **Staff-only areas:** the kitchen, laundry, Security Office, break room, storage and the back of the front desk.
  Guests walk around them, but nosy ones (kids especially) wander in. Walk up and press E to escort them out
  before they burn the food, unplug the security monitors or try the basement door.
- **Power:** when the lights die, the breaker box is outside, round the back of the hotel. A path runs round
  either side of the building from the entrance; take a flashlight.
- **The Security Office:** at the west end of the hallway. Sit at the monitors (E) to watch the hotel's cameras,
  four at a time. The HUD goes away while you watch, so it works best with somebody else out on the floor.
- **Upstairs:** once you've built more floors, take the elevator at the north end of the lobby hallway, or the
  staircase along the hallway's north wall at its west end: a straight flight up to a landing at the end of the hall
  upstairs, with a banister round the opening (the next flight up starts back at the foot of that opening). Guests,
  helpers and monsters use the stairs too, whichever way is quicker. Each floor has a linen closet (towels) and a
  housekeeping closet (a mop and a plunger). Jobs on other floors show ↑2F or ↑3F instead of a distance.

The hotel runs dim at night and the lights flicker, more so as the season goes on. Every room has a window; open
the curtains and you'll see the snow coming down on the pines.

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
A banner shows how many jobs are left. If nobody finishes within eight minutes, the day crew takes over and Mr.
Harrow docks your pay for the leftovers.

## Growing the hotel

The terminal in the break room has four tabs:

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

One season, one story. Every shift's guests, letter and phone calls tie back to what is under the hotel.

| # | Shift | What checks in | Target |
| --- | --- | --- | --- |
| 1 | Grand Opening | Regular folks (and an influencer whose review counts double). Mr. Harrow has three rules. Was somebody standing at the end of the hall? | ★ 2.75 |
| 2 | The Quiet Guest | Regular folks... and a very polite man named Ambrose who asks about the basement. The line to Room 000 starts ringing | ★ 3.00 |
| 3 | Family Reunion | Big families with sticky kids. The boiler is knocking, and there's a man in a red coat in the halls | ★ 3.00 |
| 4 | Synergy Inc. Retreat | A work party whose CEO wants to see the basement. Tonight the door opens, and not every suitcase is luggage | ★ 3.25 |
| 5 | They Come in Peace | Aliens who followed a signal from beneath the hotel, a government agent, and something in the security cameras | ★ 3.25 |
| 6 | Midnight Society | Vampires, and a "book club" with chalk that wants the basement key | ★ 3.50 |
| 7 | Checkout Is Forever | The guests from 1926 come back, guests who look like other guests check in, and the thing in the basement wakes up | ★ 3.25 |

Targets shown are for the Normal preset. After shift 7 you can keep going in endless Overtime.

Some horror tips, if you want them:

- Nothing announces itself. A monster goes on the task list only once one of you has seen it, and blood or a body
  only once someone has found it (security cameras help). Before that, listen for slow footsteps and watch for
  the lights stuttering.
- If something catches you, you're out for the rest of the shift and watch through your crewmates' eyes. If it gets
  the whole crew, the shift ends there and every guest still in the hotel checks out furious.
- Monsters hunt whoever they can see. Hold your flashlight on one for a second to stun it, or break line of sight
  and run.
- Don't pick up a suitcase tagged for Room 000.
- Some things only show up on the security monitors. Listen for the hiss, and keep somebody at the cameras: flash
  the camera it's on before it reaches anyone.
- On the fourth night the CEO goes down to the basement. Somebody has to go down after him, wake him up (E) and lead
  him back up the steps before something notices him.
- On the last night, when the lights die and the basement door bursts open, fetch the brass key from the porter's
  cart in the basement and lock the iron door with it before dawn. If the door isn't locked by 6 AM, the shift is
  lost whatever the reviews say. Locking it brings the power back.
- Read the check-in cards. Some guests should not be let in, and turning them away is the right call.
- Guests who see blood or a body flee and leave a 1-star review. The dumpster is outside, west of the entrance.
- Close the curtains in vampire rooms before 6 AM.

## Project layout

```
server.js            static file server + WebSocket relay for co-op rooms
public/index.html    page, HUD markup and the main menu
public/style.css     all styling
public/src/
  main.js            bootstrap, game loop, settings, pings, the security camera view, glue between sim/network/rendering
  sim.js             the host-side simulation (guests, tasks, ratings, room tiers, the phone, horror and the story)
  helpers.js         the hired robots and staff (mixed into the simulation)
  difficulty.js      difficulty presets, options and crew-size scaling
  content.js         guest types, names, check-in cards, survey lines, shifts, upgrades, and Mr. Harrow's letters and calls
  layout.js          floor plan (every storey and the basement), colliders, interactables, room decor and the nav graph
  world.js           builds the hotel and drives doors, lights, the sky, upgrade fixtures and room decor
  props.js           furniture, fixtures and the hotel frontage
  models.js          guests, staff, helpers, monsters, items, messes, cars, the UFO
  looks.js           how each guest looks (deterministic from a seed)
  view.js            turns simulation snapshots into moving 3D objects
  player.js          first-person controller and valet driving
  interact.js        targeting, prompts and actions
  hud.js             HUD, minimap, waypoint, check-in card, phone calls, letters and the break room terminal
  audio.js           procedurally synthesized sound
  net.js             networking client
test/                headless tests and balance bots (npm test)
```

Every model, texture and sound is generated in code, so the game ships no asset files.

Upper floors are laid out side by side with the ground floor in the simulation (1000 m apart) and lifted into
place when drawn, so the simulation stays 2D. `toWorld()` in `layout.js` does the lift. Floors connect by the
elevator (a short wait, then a jump) and by the staircase: the flights stack in one slot, the walkable height there
comes from `surfaceY()` (the highest flight within a step of your feet), and halfway up a flight a walker's position
switches to the next floor's coordinates at the same spot in the building. The basement is one more level, 3000 m
out and drawn 6 m below the ground floor (`levelY()`); the door in Storage leads to its steps.

NPCs plan routes with `planPath()`: A* over the nav graph between whichever nearby nodes they can actually walk to
in a straight line, measured in real distances (the check-in line costs extra to walk through), then straightened
wherever a straight line is clear. While walking they round corners, and step around each other and the crew.

## Tuning

- Shift lineups and story events, rating targets, guest types, room tiers, upgrade prices and perks are in
  `public/src/content.js`, along with the story's text: the letters, Mr. Harrow's calls, the Room 000 whispers and
  the 1926 register (what each Hotel upgrade level adds is applied where it's used in `sim.js`, with `cleanTime()`
  shared).
- Difficulty presets and the crew-size tables are in `public/src/difficulty.js`.
- Timers (patience, the phone, luggage, requests, breakfast) and complaint caps are at the top of
  `public/src/sim.js`; helper speeds, counts and training are at the top of `public/src/helpers.js`.
- `npm test` checks the navigation graph (including that guests never route through staff areas), difficulty
  settings, expansions, helpers and the story (the break room, the phone, being taken, the mimic, the Static, the
  basement rescue and the finale), and plays every shift with bots, including "human-speed" bots that pay walking
  time for every trip. Run it after changing balance numbers to see how the curve moves.
