// Screenshot staging for the dossier: each scene is set up from the live
// game systems (real police, real helicopter, real missions) — nothing is
// faked. Loaded via game/index.html?shot=<name>; the capture script waits
// for the scene to develop (the helicopter needs a few seconds to arrive).
import { Vehicle } from './cars.js';
import { modelById } from './config.js';

const NO_PIER = { minX: -1, maxX: -1, minZ: -1, maxZ: -1 };   // place() only reads it for deck height

function givePlayerCar(api, modelId, paint, x, z, heading) {
  const v = new Vehicle(api.scene, modelById(modelId), paint, {});
  v.driver = 'parked';
  v.place(x, z, heading, NO_PIER);
  api.enterCar(v);
  return v;
}

export function stageShot(name, api) {
  if (name === 'chase') {
    // Five stars on Ocean Drive: Dario flees west in a Velocity RS while a
    // roadblock forms ahead and the helicopter burns its spotlight down.
    api.setDaylight(0.86);
    const car = givePlayerCar(api, 'velocity', 0xd64541, 185, 156.9, -Math.PI / 2);
    car.speed = 8;
    api.setWanted(5);
    api.setCamera(96, 13, 188, 142, 1, 157);   // high and wide: roadblock, hero car and spotlight all fit
    return true;
  }
  if (name === 'drive') {
    // Golden-hour cruise: a Coral Roadster on Ocean Drive, sea behind it.
    api.setDaylight(0.82);
    const car = givePlayerCar(api, 'coral', 0xff6b81, 60, 163.1, Math.PI / 2);
    car.speed = 0;
    api.setCamera(55.5, 1.5, 168, 62.5, 0.95, 161.5);   // low and close: the roadster fills the frame
    return true;
  }
  if (name === 'foot') {
    // Beachfront: armed on the promenade, sand + umbrellas + ocean ahead.
    api.setDaylight(0.38);
    api.grantWeapon('pistol');
    api.equipWeapon('pistol');
    api.teleport(30, 200, 0);
    api.setCamera(21, 3.4, 187, 36, 1.0, 216);   // over the promenade: Dario, the sand strip, the sea
    return true;
  }
  if (name === 'shop') {
    // Marco's alley in Harbor Industrial, shop overlay open.
    api.setDaylight(0.5);
    api.teleport(358, 101.5, Math.PI);
    api.openShop();
    return true;
  }
  if (name === 'wheel') {
    // On foot on the promenade, pistol + shotgun in the locker; the capture
    // script holds Q to open the weapon wheel and highlights a slot.
    api.setDaylight(0.38);
    api.grantWeapon('pistol');
    api.grantWeapon('shotgun');
    api.equipWeapon('pistol');
    api.teleport(30, 200, 0);
    api.setCamera(21.5, 3.2, 187, 34, 1.1, 210);   // player mid-frame under the wheel, beach + sea beyond
    return true;
  }
  if (name === 'duo') {
    // DUO chapter 1 just started: switch campaigns (staging only, via the
    // debug hook), then start 'Fresh Air' — the runner banners the chapter
    // itself. Rafa waits by Val at the Coastal Correctional gate.
    api.setDaylight(0.45);
    window.__game.startCampaign('duo', true);
    api.startMission('freshair');
    api.setCamera(-243, 4.5, 175, -224, 1.2, 161);   // from the coast road: the pair at the gate, city behind
    return true;
  }
  if (name === 'mission') {
    // Chapter 1 just started: story banner up, first marker throbbing east.
    api.setDaylight(0.55);
    api.startMission('sprint');
    api.teleport(24, 171, Math.PI / 2);
    api.banner('Chapter 1 — Sunset Sprint', 'Lola sizes up the new arrival: "Fresh off the boat, huh? Show me you can run my waterfront."');
    api.setCamera(13, 3.6, 159, 42, 2, 175);
    return true;
  }
  return false;
}
