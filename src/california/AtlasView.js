// Aspect-aware map navigation shared by mouse, touch and keyboard controls.
export class AtlasView {
 constructor(bounds){this.bounds=bounds;this.width=1;this.height=1;this.cx=bounds.x+bounds.size/2;this.cz=bounds.z+bounds.size/2;this.zoom=1;}
 resize(width,height){this.width=Math.max(1,width);this.height=Math.max(1,height);}
 get scale(){return Math.min(this.width,this.height)/this.bounds.size*this.zoom;}
 screen(x,z){return{x:this.width/2+(x-this.cx)*this.scale,y:this.height/2+(z-this.cz)*this.scale};}
 world(x,y){return{x:this.cx+(x-this.width/2)/this.scale,z:this.cz+(y-this.height/2)/this.scale};}
 pan(dx,dy){this.cx-=dx/this.scale;this.cz-=dy/this.scale;this.clamp();}
 zoomAt(factor,x=this.width/2,y=this.height/2){const p=this.world(x,y);this.zoom=Math.max(1,Math.min(2048,this.zoom*factor));this.cx=p.x-(x-this.width/2)/this.scale;this.cz=p.z-(y-this.height/2)/this.scale;this.clamp();}
 focus(x,z,zoom=this.zoom){this.cx=x;this.cz=z;this.zoom=Math.max(1,Math.min(2048,zoom));this.clamp();}
 fit(){this.focus(this.bounds.x+this.bounds.size/2,this.bounds.z+this.bounds.size/2,1);}
 clamp(){const b=this.bounds;this.cx=Math.max(b.x,Math.min(b.x+b.size,this.cx));this.cz=Math.max(b.z,Math.min(b.z+b.size,this.cz));}
}
