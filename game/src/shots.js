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
    // Beachfront: Val on the promenade, bat in hand (the starting melee
    // weapon is the default equip), sand + umbrellas + ocean ahead.
    api.setDaylight(0.38);
    api.setLead('val');
    api.teleport(30, 200, 0);
    api.setCamera(21, 3.4, 187, 36, 1.0, 216);   // over the promenade: Val, the sand strip, the sea
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
    // The merged campaign at chapter 11: Dario's ten chapters marked done
    // (staging only, via the debug hook), then 'Fresh Air' starts — the
    // transition banner rolls and Rafa waits by Val at the prison gate.
    api.setDaylight(0.45);
    api.setDone(['sprint', 'package', 'drops', 'grandprix', 'tour', 'heat', 'dome', 'cashrun', 'revenge', 'king']);
    api.startMission('freshair');
    api.setCamera(-243, 4.5, 175, -224, 1.2, 161);   // from the coast road: the pair at the gate, city behind
    return true;
  }
  if (name === 'mission') {
    // Chapter 11 banner: the merged campaign rolls into the duo arc — the
    // transition banner over the prison-gate pickup, objective line reading
    // "Chapter 11 — Fresh Air".
    api.setDaylight(0.55);
    api.setDone(['sprint', 'package', 'drops', 'grandprix', 'tour', 'heat', 'dome', 'cashrun', 'revenge', 'king']);
    api.startMission('freshair');
    api.banner('Chapter 11 — Fresh Air', 'Meanwhile, across the bay… Five years Val took the fall. Today the gate opens.');
    api.setCamera(-243, 4.5, 175, -224, 1.2, 161);
    return true;
  }
  if (name === 'heist') {
    // Inside the Harbor Bank during the hostage step: chapters 1–16 marked
    // done (staging), the prologue talk skipped, the player walked in —
    // six hostages sit subdued, hands up, while the partner waits at the
    // vault door.
    api.setDaylight(0.85);
    api.setDone(['sprint', 'package', 'drops', 'grandprix', 'tour', 'heat', 'dome', 'cashrun', 'revenge', 'king', 'freshair', 'firstscore', 'keys', 'hotcargo', 'fence', 'betrayal']);
    api.startMission('kingdom');
    window.__game.plus.skipDialogue();
    api.teleport(100, 150, Math.PI);
    // the runner advances talk → heist → 'enter' over the next frames;
    // walk in once the door step is live (the capture waits seconds anyway)
    setTimeout(() => { window.__game.plus.enterBank(); }, 1500);
    api.setCamera(50, 2.7, 993, 66, 1.1, 1004);   // across the lobby: hostages, counter, vault door beyond
    return true;
  }
  return false;
}
