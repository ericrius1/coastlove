import {unproject} from './Geography.js';
import {findSafeSpot} from '../exploration/Navigation.js';
import {Vector3} from '../engine/index.js';

export function mapPin(x,z){
 const {lon,lat}=unproject(x,z),coordinates=`${Math.abs(lat).toFixed(5)}° ${lat>=0?'N':'S'}, ${Math.abs(lon).toFixed(5)}° ${lon>=0?'E':'W'}`;
 return{id:'map-pin',kind:'pin',custom:true,label:'Your map pin',name:'Your map pin',x,z,lon,lat,hint:`${coordinates} · Press Enter to teleport. Land on nearby safe ground, or take a boat on the water.`};
}

export function mapPinArrival(app,pin){
 const terrain=app.terrainData,limit=terrain.size/2-80;
 if(!Number.isFinite(pin.x)||!Number.isFinite(pin.z)||Math.abs(pin.x)>limit||Math.abs(pin.z)>limit)return null;
 // Include bridge decks and piers without snapping the pin to a street.
 const ground={size:terrain.size,heightAt:(x,z)=>Math.max(terrain.groundHeight?.(x,z)??terrain.heightAt(x,z),app.colliders?.groundHeightAt(x,z,Infinity)??-Infinity)};
 const water=ground.heightAt(pin.x,pin.z)<1.5,clear=(x,z)=>!app.realCities?.containsBuilding(x,z);
 const position=findSafeSpot(ground,app.colliders,pin.x,pin.z,water,80,clear);
 if(position)return{position,mode:water?'boat':'walk'};
 // A cliff or a dense block must not strand the player inside a building.
 // Arrive above that exact pin in the plane when there is no safe footing.
 return{position:new Vector3(pin.x,ground.heightAt(pin.x,pin.z),pin.z),mode:'plane'};
}
