# Floor 50

A co-op, first-person horror game that runs in the browser.

It opens with a cutscene at street level, just before eight. You and your
friends walk up to the tower, cross the lobby and get in the elevator. A man
in a long coat stops the doors closing and gets in with you. He's going to
fifty too. On fifty he follows you down the corridor, closer than he should.
You get inside, bolt the door and put the chain on, and someone looks
through the peephole. He's standing right there. Then he knocks. The host
can hold Space to skip the cutscene.

Then it's your apartment (two bedrooms, one bathroom, floor-to-ceiling glass
over the city at dusk), and you have to **survive until 6 AM**:

- **He keeps coming back to knock.** If nobody answers he knocks harder,
  then bangs, then starts working on the lock. If the deadbolt gives,
  he's in. If you left it unlocked, he lets himself in.
- **Opening the door makes him stop.** Sometimes he's just gone. Sometimes
  he's standing there and wants to talk. Sometimes he goes and finds
  someone else to wear, and they come knocking instead.
- **Other people knock too:** Margaret from 50D, the building super, a
  delivery driver, a police officer. Some are exactly who they say they
  are. Some are him. Look through the **peephole** first: people blink and
  fidget and look around, and something wearing a person doesn't. Listen to
  how they knock and what they say through the door (keys 1-3).
- **The chain** lets you open the door a crack. Hold it open too long on the
  wrong person and it won't hold. Open the door all the way only for people
  you're sure about. Turn real people away and he may get to them later.
  Help them and they help you (the super fixes your lock, the police keep
  him away for a while).
- **If he gets inside, the lights go out.** Hide in a closet, a wardrobe,
  behind the shower curtain or under a bed, and hold your breath when he's
  close. Your phone light helps you see and helps him see you. He takes one
  of you and leaves. Later, the one he took might come back knocking.

**Play it:** <https://nickypeakin.github.io/gsgs/> (once GitHub Pages is
switched on, see below). It works in Chrome, Edge or Firefox on a computer
with a keyboard and mouse. Headphones help.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | walk |
| Mouse | look |
| Shift | run |
| C | crouch |
| E | use: peephole, deadbolt, chain, door handle, hiding spots |
| 1 / 2 / 3 | through the door: "Who is it?" / "What do you want?" / "Go away!" |
| Space (hold) | hold your breath while hiding |
| F | phone light |
| Esc | pause |
| Space (hold) | skip the opening cutscene (host only) |

## Playing with friends

- **Solo:** click **Play Solo**. Three friends played by the computer come
  home with you. They sit on the sofa, watch the door with you and hide when
  he gets in, but they never touch the door: that's your job.
- **With friends:** one person clicks **Host a Game** and sends the invite
  link from the lobby screen (the **Copy** button). Friends open the link and
  press **Join Game**, or open the game and type the 5-letter code. Empty
  spots can be filled with computer friends. The host must stay on the lobby
  screen until everyone is in, then click **Start the Night**.

There's no game server. The host's browser runs the night, and friends
connect straight to it over WebRTC. The free [PeerJS](https://peerjs.com)
service is only used to find each other by lobby code. The host has to keep
the game open while everyone plays. If a friend drops out mid-night, a
computer friend takes over their character.

If friends can't get in, have everyone press **Test Connection** on the main
menu. Some school and work networks block these connections; the game then
tries public relay servers, and if that fails too, switching either player
to a different network (a phone hotspot works) usually fixes it.

## Publishing to GitHub Pages (one-time setup)

`.github/workflows/pages.yml` tests the game, builds it and publishes it on
every push to the default branch. GitHub only needs to be told to use it
once: in the repository go to **Settings → Pages → Build and deployment →
Source** and pick **GitHub Actions**. Then re-run the workflow from the
**Actions** tab, or push any change.

## Running it locally

Needs Node.js 20 or newer.

```sh
npm install
npm run dev      # builds dist/ and serves it at http://localhost:8080
npm test         # plays whole nights headless against the host simulation
```

## How it's built

Plain JavaScript modules and [three.js](https://threejs.org). Every model,
texture and sound is generated in code, so there are no asset files: the
people are sculpted from smooth lofted shapes (faces that blink, hair,
clothes, hands), the skyline is thousands of instanced towers lit by a window
shader, and every knock is synthesised. Spoken lines use the browser's own
voices (Settings can turn them off; subtitles always show). The picture
renders in HDR with bloom and drops resolution automatically on computers
that can't keep up.

```
public/
  index.html, css/style.css
  js/main.js              menus, lobby and the flow of a night
  js/shared/              rules the host and every client agree on
    config.js             tuning numbers
    layout.js             floor 50: walls, the door, furniture, hiding spots
    lines.js              everything anyone says
    nav.js, collision.js, rng.js
  js/host/                runs in the host's browser (and in Node for tests)
    lobby.js              players joining and leaving, starting nights
    match.js              the night: the door, who knocks, what happens
    stalker.js            him, once he's inside
    bots.js               friends played by the computer
    timers.js
  js/client/              what each player sees and hears
    game.js               first person: the door, the peephole, hiding
    cutscene.js           the opening, shot by shot
    humans.js             procedural people and their animation
    world.js              the apartment, corridor and elevator on fifty
    ground.js             the street and lobby for the opening
    city.js               the sky and the skyline through the night
    door.js               the front door, its chain and the peephole
    props.js, elevator.js furniture and fittings
    post.js               bloom, tone mapping and the fisheye peephole
    audio.js, voice.js    synthesised sound, spoken lines
    avatar.js, ui.js, net.js, input.js, attract.js, textures.js, util.js
```

The host decides everything that matters (who knocks, what happens when the
door opens, where he searches); each client moves its own character, reports
what it does at the door, and draws the rest from the host's snapshots.
