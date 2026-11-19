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
    // On foot at the head of Lola's Quay: pier, stalls, lighthouse, boats.
    api.setDaylight(0.3);
    api.teleport(188, 202, 0);
    api.setCamera(179, 5.5, 183, 193, 1.5, 234);   // down the pier: stalls, boats, lighthouse
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
