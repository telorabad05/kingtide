// Screenshot scenes behind ?shot=foot|drive|chase|mission. Each one stages the
// real game — no faked state: the player really enters a car, the wanted level
// really summons Harbor PD (five stars: roadblock and the v3 helicopter, staged
// overhead so its spotlight reads in the frame), the race really starts with
// Rico on the grid — then holds a key down so the frame is a living moment,
// and flags window.__shotReady when it settles.
import { MISSION_DEFS } from './missions.js';

function holdKey(code, down) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
}
/** Wait by the game's own clock: under a software renderer the frame rate is low,
 *  so wall-clock waits would freeze the action mid-gesture. */
async function waitGame(game, seconds) {
  const t0 = game.G.time, wall0 = Date.now();
  while (game.G.time - t0 < seconds && Date.now() - wall0 < 120000) {
    await new Promise((r) => setTimeout(r, 120));
  }
}

function takeParkedCar(game, nearX, nearZ) {
  let best = null, bestD = Infinity;
  for (const v of game.parkedCars) {
    const d = Math.hypot(v.x - nearX, v.z - nearZ);
    if (d < bestD) { bestD = d; best = v; }
  }
  game.player.x = best.x + 2; game.player.z = best.z; game.player.syncMesh();
  game.enterCar(best);
  game.G.wanted = 0;                       // the take itself is not the story of the shot
  return best;
}

/** Shove live traffic out of a staging spot so a teleported car never lands
 *  on top of another car (an overlap reads as a crash and jams the lane). */
function clearLane(game, x, z, radius) {
  for (const c of game.traffic.cars) {
    const v = c.vehicle || c;
    if (Math.hypot(v.x - x, v.z - z) < radius) {
      v.x += Math.sin(v.heading) * 34;
      v.z += Math.cos(v.heading) * 34;
    }
  }
}

export async function initShots(game) {
  const name = new URLSearchParams(window.location.search).get('shot');
  if (!name) return;
  const { G, player, police } = game;
  document.getElementById('titleScreen').style.display = 'none';
  G.mode = 'play';
  try {
    if (name === 'foot') {
      player.x = 0; player.z = 173; player.heading = Math.PI / 2; player.syncMesh();
      G.camYaw = Math.PI / 2; G.camPitch = 0.3; G.camDist = 5.4;
      // stroll three real pedestrians down the Ocean Drive strip, ahead of
      // the eastbound player so they land inside the frame
      const strip = game.city.sidewalkLoops.find((l) => l.type === 'line' && l.z1 === 173);
      if (strip) game.peds.peds.slice(0, 3).forEach((ped, i) => {
        ped.loop = strip; ped.s = 272 + i * 15; ped.state = 'walk';
      });
      // and two more stopped for a chat at the boardwalk rail (v3.1): the
      // frame should show Solmarina lingering, not just passing through
      const [chatA, chatB] = game.peds.peds.slice(3, 5);
      if (chatA && chatB) {
        chatA.x = 10; chatA.z = 175.5; chatA.state = 'chat'; chatA.timer = 60; chatA.heading = Math.atan2(1.6, -4.5);
        chatB.x = 11.6; chatB.z = 171; chatB.state = 'chat'; chatB.timer = 60; chatB.heading = Math.atan2(-1.6, 4.5);
        chatA.group.position.set(chatA.x, 0.24, chatA.z); chatA.group.rotation.y = chatA.heading;
        chatB.group.position.set(chatB.x, 0.24, chatB.z); chatB.group.rotation.y = chatB.heading;
      }
      holdKey('KeyW', true);                 // stroll east along the promenade
      await waitGame(game, 1.4);
      holdKey('KeyW', false);
      player.heading = Math.PI / 2;
    } else if (name === 'drive') {
      const car = takeParkedCar(game, 60, 170);
      car.x = -80; car.z = 164; car.heading = Math.PI / 2; car.speed = 10;
      clearLane(game, car.x, car.z, 16);
      G.camYaw = car.heading; G.camPitch = 0.34;
      holdKey('KeyW', true);
      await waitGame(game, 2.2);
      holdKey('KeyW', false);
      G.wanted = 0;                          // a stray bump must not star a cruising shot
    } else if (name === 'chase') {
      // Fastest parked car for the getaway, so the pack stays behind the
      // camera line instead of converging on top of the player.
      let car = null;
      for (const v of game.parkedCars) if (!car || v.model.speed > car.model.speed) car = v;
      game.player.x = car.x + 2; game.player.z = car.z; game.player.syncMesh();
      game.enterCar(car);
      G.wanted = 0;
      car.x = -40; car.z = 164; car.heading = Math.PI / 2; car.speed = 20;
      clearLane(game, car.x, car.z, 16);
      G.camYaw = car.heading; G.camPitch = 0.42;
      game.addCrime(5, 'Grand theft auto!');   // five stars: the roadblock comes out too
      // the air unit is part of the five-star story now: stage the helicopter
      // up ahead of the chase, where the camera can see it and its spotlight
      // cone, instead of waiting for it to bank in from off-map behind us
      police.heli.position.set(car.x + 10, 25, car.z - 6);
      // One interceptor door-to-door on each side, set a little further back
      // than v1's staging so the frame catches the pack mid-pounce, still moving.
      const spots = [[4.2, 5], [-4.2, 9]];
      for (let i = 0; i < spots.length; i++) {
        const cop = police.spawnCop(car.x, car.z);
        cop.x = car.x - spots[i][1]; cop.z = 164 + spots[i][0];
        cop.heading = Math.PI / 2; cop.speed = 17;
      }
      holdKey('KeyW', true);
      await waitGame(game, 0.5);             // freeze the moment before the pack converges
      holdKey('KeyW', false);
    } else if (name === 'mission') {
      // v2's showcase: the Harbor Run GP — player and Rico side by side on the
      // start line, the race objective up, the chequered flag on the minimap
      const start = MISSION_DEFS.find((d) => d.id === 'race').start;
      player.x = start.x; player.z = start.z; player.syncMesh();
      game.missions.tryStart(player.x, player.z);
      const car = takeParkedCar(game, start.x, 170);
      car.x = start.x + 1; car.z = 164; car.heading = Math.PI / 2; car.speed = 9;
      clearLane(game, car.x, car.z, 16);
      // pull Rico up alongside the player so the grid reads in the frame, not just on the map
      if (game.rival) {
        game.rival.v.x = car.x + 10; game.rival.v.z = 170.5;
        game.rival.v.heading = Math.PI / 2; game.rival.v.speed = 9;
      }
      G.camYaw = car.heading; G.camPitch = 0.34;
      holdKey('KeyW', true);
      await waitGame(game, 1.8);
      holdKey('KeyW', false);
    }
    await waitGame(game, 0.4);
    window.__shotReady = true;
  } catch (err) {
    window.__shotError = String(err && err.stack || err);
  }
}
