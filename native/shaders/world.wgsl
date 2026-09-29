struct Frame {
 view:mat4x4f, inverse_view:mat4x4f, light:mat4x4f,
 camera:vec4f, sun:vec4f, sky:vec4f, params:vec4f, origin:vec4f, viewport:vec4f, ocean_phase:array<vec4f,2>,
}
@group(0) @binding(0) var<uniform> frame:Frame;
@group(1) @binding(0) var leaves:texture_2d<f32>;
@group(1) @binding(1) var wood_a:texture_2d<f32>;
@group(1) @binding(2) var wood_n:texture_2d<f32>;
@group(1) @binding(3) var stone_a:texture_2d<f32>;
@group(1) @binding(4) var stone_n:texture_2d<f32>;
@group(1) @binding(5) var roof_a:texture_2d<f32>;
@group(1) @binding(6) var roof_n:texture_2d<f32>;
@group(1) @binding(7) var material_sampler:sampler;
@group(2) @binding(0) var shadow_map:texture_depth_2d;
@group(2) @binding(1) var shadow_sampler:sampler_comparison;
@group(2) @binding(2) var ocean_displacement:texture_2d_array<f32>;
@group(2) @binding(3) var ocean_derivatives:texture_2d_array<f32>;
@group(2) @binding(4) var ocean_sampler:sampler;
@group(3) @binding(0) var opaque:texture_2d<f32>;
@group(3) @binding(1) var scene_depth:texture_depth_multisampled_2d;
struct In {
 @location(0) position:vec3f,@location(1) normal:vec3f,@location(2) color:vec3f,
 @location(3) uv:vec2f,@location(4) material:f32,
 @location(5) m0:vec4f,@location(6) m1:vec4f,@location(7) m2:vec4f,@location(8) m3:vec4f,
 @location(9) surface:vec4f,
}
struct Out {
 @builtin(position) clip:vec4f,@location(0) position:vec3f,@location(1) normal:vec3f,
 @location(2) color:vec3f,@location(3) uv:vec2f,@location(4) material:f32,
 @location(5) surface:vec4f,@location(6) local:vec3f,
}
fn hash(p:vec2f)->f32 {
 let q=bitcast<vec2u>(vec2i(floor(p)));let state=(q.x*374761393u ^ q.y*668265263u)*747796405u+2891336453u;
 let word=((state>>((state>>28u)+4u))^state)*277803737u;
 return f32(((word>>22u)^word)>>8u)/16777216.;
}
fn noise(p:vec2f)->f32 {let i=floor(p);let f=fract(p);let u=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2f(1.,0.)),u.x),mix(hash(i+vec2f(0.,1.)),hash(i+vec2f(1.,1.)),u.x),u.y);}
fn fbm(p:vec2f)->f32 {return noise(p)*.55+noise(p*2.03+17.)*.27+noise(p*4.13-9.)*.13+noise(p*8.27)*.05;}
fn world_vertex(v:In)->vec3f {
 var p=(mat4x4f(v.m0,v.m1,v.m2,v.m3)*vec4f(v.position,1.)).xyz;
 if v.material>=5.&&v.material<9. {
  // Coherent branch motion plus leaf-scale flutter, anchored at the trunk.
  let phase=frame.params.x*1.15+v.m3.x*.12+v.m3.z*.08;
  let flex=max(0.,v.position.y-1.5)*.012;
  p.x+=sin(phase)*flex;p.z+=cos(phase*.71)*flex*.65;
  if v.material>=6.{p+=vec3f(sin(phase*2.3+dot(v.position,vec3f(1.3,.6,.7))),.3*cos(phase*1.7+v.position.z*2.),0.)*.025;}
 }return p;
}
fn vertex_out(v:In)->Out {
 var o:Out;o.position=world_vertex(v);o.clip=frame.view*vec4f(o.position,1.);
 let basis=mat3x3f(v.m0.xyz,v.m1.xyz,v.m2.xyz);
 let normal_basis=mat3x3f(cross(basis[1],basis[2]),cross(basis[2],basis[0]),cross(basis[0],basis[1]));
 o.normal=normalize(normal_basis*v.normal);o.color=v.color;o.uv=v.uv;o.material=v.material;o.surface=v.surface;o.local=v.position;
 return o;
}
@vertex fn vs_main(v:In)->Out {return vertex_out(v);}
@vertex fn vs_shadow(v:In)->Out {var o=vertex_out(v);o.clip=frame.light*vec4f(o.position,1.);return o;}
fn leaf_uv(uv:vec2f,mat:f32)->vec2f {return vec2f(clamp(uv.x,.004,.996)*.5+select(0.,.5,fract(mat)>.05),1.-clamp(uv.y,.004,.996)*.5);}
fn pinnae(uv:vec2f,width:f32,palm:bool,derivative:f32)->f32 {
 let count=select(26.,95.,palm);let along=uv.x*count;
 let jitter=hash(vec2f(floor(along),12.3));let tip=uv.y/mix(.78,1.,jitter);
 let edge=select(sqrt(max(0.,1.-tip*tip))*.34,pow(max(0.,1.-tip),.6)*.27,palm);
 let aa=max(derivative*count,.015);let rachis=1.-smoothstep(.012,.025,uv.y*max(width,.1));
 return max(rachis,(1.-smoothstep(edge-aa,edge+aa,abs(fract(along)-.5)))*(1.-smoothstep(.95,1.,tip))*smoothstep(.025,.065,uv.x));
}
@fragment fn fs_shadow(v:Out) {
 let cov=textureSample(leaves,material_sampler,leaf_uv(v.uv,v.material)).r;
 let leaf_lod=log2(max(max(fwidth(v.uv.x),fwidth(v.uv.y))*512.,1.));
 let threshold=mix(.5,.14,smoothstep(0.,4.,leaf_lod));
 let fw=fwidth(v.uv.x);
 if v.material>=6.&&v.material<7.&&cov<threshold {discard;}
 if v.material>=7.&&v.material<9.&&pinnae(v.uv,v.surface.z,v.material>7.5,fw)<.45{discard;}
}
fn atmosphere(ray:vec3f)->vec3f {
 let day=frame.sun.w;let elevation=max(0.,ray.y);let horizon=pow(1.-elevation,5.);
 let mu=max(0.,dot(ray,frame.sun.xyz));
 // Rayleigh-blue zenith, a neutral marine aerosol horizon, forward Mie glow.
 let blue=mix(vec3f(.115,.255,.46),vec3f(.54,.62,.68),horizon);
 let low_sun=1.-smoothstep(.08,.55,frame.sun.y);
 var col=mix(vec3f(.002,.006,.016),blue,day);
 col+=vec3f(.50,.20,.065)*low_sun*horizon*(.16+pow(mu,8.))*day;
 col+=vec3f(.19,.16,.12)*pow(mu,28.)*day;
 let moon_dir=normalize(vec3f(-.45,.62,-.65));
 let moon=smoothstep(.99988,.99994,dot(ray,moon_dir));
 col+=vec3f(.55,.66,.82)*moon*(1.-day);
 let disk=smoothstep(.999965,.999985,dot(ray,frame.sun.xyz));
 col+=mix(vec3f(14.,9.,4.),vec3f(24.,22.,17.),smoothstep(.08,.5,frame.sun.y))*disk*day;
 if ray.y>.012 {
  let p=ray.xz/(ray.y+.12)*1.8+vec2f(frame.params.x*.0013,0.);
  let field=fbm(p+fbm(p*.7)*2.);
  let cloud=smoothstep(.56,.78,field)*smoothstep(.01,.14,ray.y);
  let silver=smoothstep(.55,.68,field)*(1.-smoothstep(.66,.78,field))*pow(mu,12.);
  let cloud_col=mix(vec3f(.018,.027,.045),mix(vec3f(.48,.52,.56),vec3f(.88,.86,.80),smoothstep(.58,.78,field)),day);
  col=mix(col,cloud_col,cloud*.85)+silver*day*.12;
  col+=pow(hash(floor(ray.xz/(ray.y+.25)*1100.)),240.)*pow(1.-day,4.)*vec3f(.5,.65,1.);
 }return col;
}
// Aerial scattering is low frequency. Stars and the sun disc belong only in
// the sky/reflections; blending them into fog would paint stars onto hills.
fn aerial(ray:vec3f)->vec3f {
 let low_sun=1.-smoothstep(.08,.55,frame.sun.y);
 let day=mix(vec3f(.42,.53,.64),vec3f(.55,.61,.65),pow(1.-max(0.,ray.y),4.));
 return mix(vec3f(.008,.016,.033),day,frame.sun.w)+vec3f(.18,.06,.018)*low_sun*pow(max(0.,dot(ray,frame.sun.xyz)),8.)*frame.sun.w;
}
fn sun_color()->vec3f {return mix(vec3f(3.6,1.85,.74),vec3f(3.2,3.05,2.78),smoothstep(.04,.60,frame.sun.y))*frame.sun.w;}
fn shade_visibility(p:vec3f,n:vec3f)->f32 {
 let lc=frame.light*vec4f(p+n*.035,1.);let s=lc.xyz/lc.w;let uv=s.xy*vec2f(.5,-.5)+.5;
 var shadow=0.;
 // Rotated four-tap PCF removes the hard stair-step edge without washing out
 // the very small leaf and twig shadows of the high-resolution cascade.
 for(var i=0;i<4;i++) {let a=f32(i)*1.5708+.4;shadow+=textureSampleCompareLevel(shadow_map,shadow_sampler,uv+vec2f(cos(a),sin(a))*.00042,s.z-.000065)*.25;}
 let edge=smoothstep(.0,.035,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
 return mix(1.,shadow,edge*select(0.,1.,s.z>0.&&s.z<1.));
}
fn mapped_normal(n:vec3f,dp1:vec3f,dp2:vec3f,du1:vec2f,du2:vec2f,xy:vec2f)->vec3f {
 let t=dp1*du2.y-dp2*du1.y;let b=dp2*du1.x-dp1*du2.x;
 let inv=inverseSqrt(max(max(dot(t,t),dot(b,b)),1e-8));
 return normalize(n*sqrt(max(.1,1.-dot(xy,xy)))+(t*xy.x+b*xy.y)*inv);
}
fn brdf(base:vec3f,n:vec3f,V:vec3f,rough:f32,metal:f32,ao:f32,visibility:f32)->vec3f {
 let L=frame.sun.xyz;let H=normalize(L+V);let nv=max(.02,dot(n,V));let nl=max(0.,dot(n,L));let nh=max(0.,dot(n,H));let vh=max(0.,dot(V,H));
 let a=max(.035,rough*rough);let a2=a*a;let den=nh*nh*(a2-1.)+1.;let D=a2/(3.14159*den*den);
 let k=(rough+1.)*(rough+1.)/8.;let G=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);
 let F0=mix(vec3f(.04),base,metal);let F=F0+(1.-F0)*pow(1.-vh,5.);
 let spec=D*G*F/max(.08,4.*nv*max(nl,.001));
 let irradiance=mix(vec3f(.045,.043,.03),vec3f(.19,.245,.31),n.y*.5+.5)*frame.sun.w+vec3f(.035,.055,.085)*(1.-frame.sun.w);
 let environment=atmosphere(reflect(-V,n))*F0*(1.-rough*.65)*.35;
 let moonlight=vec3f(.12,.17,.25)*max(0.,dot(n,normalize(vec3f(-.45,.62,-.65))))*(1.-frame.sun.w);
 return base*(irradiance+moonlight)*ao+environment*ao+(base*(1.-metal)*(1.-F)/3.14159+spec)*sun_color()*nl*visibility;
}
@fragment fn fs_main(v:Out,@builtin(front_facing) front:bool)->@location(0) vec4f {
 var n=normalize(v.normal);let V=normalize(frame.camera.xyz-v.position);
 let du1=dpdx(v.uv);let du2=dpdy(v.uv);let dp1=dpdx(v.position);let dp2=dpdy(v.position);let fw=fwidth(v.uv);
 let leaf=textureSample(leaves,material_sampler,leaf_uv(v.uv,v.material));
 let day=frame.sun.w;var base=v.color;var emissive=vec3f(0.);var alpha=1.;var rough=clamp(v.surface.x,.06,1.);var metal=clamp(v.surface.y,0.,1.);var ao=select(v.surface.w,1.,v.material>=10.);
 let h=v.position.y+frame.origin.y;let distance=length(v.position-frame.camera.xyz);let mat=floor(v.material+.01);let world_uv=(v.position.xz+frame.origin.xz);
 if mat==1. {
  let variation=fbm(world_uv*.018);let detail=textureSampleGrad(stone_a,material_sampler,world_uv*.28,dp1.xz*.28,dp2.xz*.28);
  let nr=textureSampleGrad(stone_n,material_sampler,world_uv*.28,dp1.xz*.28,dp2.xz*.28);
  let north=frame.origin.w;let rock=smoothstep(.13,.49,1.-n.y);
  let grass=mix(vec3f(.16,.19,.066),vec3f(.056,.105,.045),north)*(0.65+variation*.65);
  let dry=mix(vec3f(.21,.19,.10),vec3f(.32,.275,.18),variation);
  base=mix(dry,grass,smoothstep(.25,.68,variation+north*.22));
  base=mix(vec3f(.43,.35,.215),base,smoothstep(1.3,6.,h));
  base=mix(base,detail.rgb*vec3f(.52,.48,.40),rock);
  let sand=1.-smoothstep(1.8,5.,h);
  let grains=noise(world_uv*6.);
  base*=mix(mix(.84,1.13,detail.g),.90+grains*.18,sand);rough=.92;
  n=mapped_normal(n,dp1,dp2,dp1.xz,dp2.xz,(nr.xy*2.-1.)*(.10+rock*.5)*(1.-sand));
  base=mix(base,vec3f(.7,.73,.71),smoothstep(2000.,2900.,h));
  base*=mix(.55,1.,smoothstep(.1,1.6,h));
 }else if mat==3. {
  let uv=v.uv/vec2f(3.2,3.);let f=fract(uv);let aa=max(fw/vec2f(3.2,3.)*.7,vec2f(.004));
  var pane=smoothstep(.19-aa.x,.19+aa.x,f.x)*(1.-smoothstep(.77-aa.x,.77+aa.x,f.x))*smoothstep(.21-aa.y,.21+aa.y,f.y)*(1.-smoothstep(.74-aa.y,.74+aa.y,f.y));
  pane=mix(pane,.3,smoothstep(.25,.65,max(aa.x,aa.y)))*step(.1,abs(n.y-1.));
  base=mix(base,vec3f(.025,.055,.075),pane);rough=mix(.9,.21,pane);metal=pane*.35;
  emissive=vec3f(1.,.48,.13)*pane*(1.-day)*step(.3,hash(floor(uv)))*.6;
 }else if mat==5. {
  let uv=vec2f(v.uv.x*3.,v.uv.y*.18);
  let tex=textureSampleGrad(wood_a,material_sampler,uv,du1*vec2f(3.,.18),du2*vec2f(3.,.18));
  let nr=textureSampleGrad(wood_n,material_sampler,uv,du1*vec2f(3.,.18),du2*vec2f(3.,.18));
  let fissures=noise(vec2f(v.uv.x*95.,v.uv.y*2.));
  base*=mix(.48,1.5,tex.g)*(.65+.5*fissures);rough=.97;n=mapped_normal(n,dp1,dp2,du1,du2,(nr.xy*2.-1.)*.65);
 }else if mat==6. {
  // Atlas coverage keeps real gaps between individual leaves. Alpha-to-coverage
  // supplies stable subpixel edges without transparent sorting or opaque blobs.
  let leaf_lod=log2(max(max(fw.x,fw.y)*512.,1.));
  let threshold=mix(.5,.14,smoothstep(0.,4.,leaf_lod));
  alpha=smoothstep(threshold-.10,threshold+.10,leaf.r);if alpha<.02{discard;}
  base*=leaf.g*1.4*(.82+leaf.b*.35);rough=.83;
 }else if mat==7.||mat==8. {
  alpha=pinnae(v.uv,v.surface.z,mat==8.,fw.x);if alpha<.02{discard;}
  if !front {n=-n;}
  base*=.8+.22*v.uv.y+.18*noise(v.uv*vec2f(30.,6.));rough=.8;
 }else if mat>=10.&&mat<=15. {
  var tex=vec4f(1.);var nr=vec4f(.5,.5,.9,1.);
  if mat==10.||mat==12.||mat==15. {
   let uv=v.uv*vec2f(.5,.25);
   tex=textureSampleGrad(wood_a,material_sampler,uv,du1*vec2f(.5,.25),du2*vec2f(.5,.25));
   nr=textureSampleGrad(wood_n,material_sampler,uv,du1*vec2f(.5,.25),du2*vec2f(.5,.25));
   let paint=clamp(v.surface.y,0.,1.);
   let bare=tex.rgb*mix(v.color,vec3f(1.1),step(.01,paint));
   let chipped=smoothstep(.28,.72,tex.a+(1.-paint)*.3);
   base=mix(bare,v.color,paint*(1.-chipped*.65));
  }else if mat==11. {
   tex=textureSampleGrad(roof_a,material_sampler,v.uv*.5,du1*.5,du2*.5);nr=textureSampleGrad(roof_n,material_sampler,v.uv*.5,du1*.5,du2*.5);
   base=mix(base,vec3f(.19,.065,.018),tex.r*.5)*(.8+tex.b*.3);metal=.55;
  }else{
   tex=textureSampleGrad(stone_a,material_sampler,v.uv*.35,du1*.35,du2*.35);nr=textureSampleGrad(stone_n,material_sampler,v.uv*.35,du1*.35,du2*.35);
   base*=.68+tex.rgb*.65;
  }
  rough=clamp(nr.b,.22,.98);ao*=mix(.6,1.,nr.a);n=mapped_normal(n,dp1,dp2,du1,du2,(nr.xy*2.-1.)*.65);
 }else if mat==2. {emissive=base*(1.-day)*2.;}
 else {
  // Keep the source roughness/metalness and metric UV pattern on town façades,
  // boats and wildlife. Fine detail fades analytically before it can shimmer.
  let grain=noise(v.uv*12.);let fade=1.-smoothstep(.04,.4,max(fw.x,fw.y));
  base*=1.+(grain-.5)*.16*fade;
  if v.surface.z>0.5&&v.surface.z<2.5 {
   let grain_tex=textureSampleGrad(wood_a,material_sampler,v.uv*.4,du1*.4,du2*.4);
   base*=.7+grain_tex.rgb*.55;
  }
 }
 if mat==10.&&v.surface.z>8.5&&v.surface.z<9.5 {
  base=mix(vec3f(.025,.045,.055),v.color*.18,.4);rough=.16;metal=.15;
  emissive=vec3f(1.9,.81,.22)*clamp(v.surface.w,0.,1.)*(1.-day);
 }
 if fract(v.material)>.2&&fract(v.material)<.3 {emissive+=vec3f(.8,.36,.08)*(1.-day);}
 let visibility=shade_visibility(v.position,n);
 var color=brdf(base,n,V,rough,metal,ao,visibility)+emissive;
 if mat>=6.&&mat<=8. {
  let transmission=pow(max(0.,dot(-V,frame.sun.xyz)),4.)*.42+max(0.,dot(-n,frame.sun.xyz))*.17;
  color+=base*sun_color()*transmission*visibility*ao;
 }
 let ray=-V;let fog=1.-exp(-distance/frame.params.z*1.55);
 color=mix(color,aerial(ray),fog);
 return vec4f(color,alpha);
}
struct Full { @builtin(position) clip:vec4f,@location(0) uv:vec2f }
@vertex fn vs_full(@builtin(vertex_index)i:u32)->Full {var p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));var v:Full;v.clip=vec4f(p[i],0.,1.);v.uv=p[i]*vec2f(.5,-.5)+.5;return v;}
fn unproject(uv:vec2f,depth:f32)->vec3f {let p=frame.inverse_view*vec4f(uv*vec2f(2.,-2.)+vec2f(-1.,1.),max(depth,.000001),1.);return p.xyz/p.w;}
fn ray_at(uv:vec2f)->vec3f{return normalize(unproject(uv,.001)-frame.camera.xyz);}
@fragment fn fs_sky(v:Full)->@location(0) vec4f{return vec4f(atmosphere(ray_at(v.uv)),1.);}
fn depth_at(uv:vec2f)->f32 {
 let pixel=clamp(vec2i(uv*frame.viewport.xy),vec2i(0),vec2i(frame.viewport.xy)-1);var d=0.;
 for(var s=0;s<4;s++){d=max(d,textureLoad(scene_depth,pixel,s));}return d;
}
struct OceanSample {disp:vec3f,slope:vec2f,foam:f32,variance:f32}
fn sea_sample(p:vec2f,footprint:f32)->OceanSample {
 var result:OceanSample;result.disp=vec3f(0.);result.slope=vec2f(0.);result.foam=0.;result.variance=0.;
 let sizes=array<f32,4>(733.,157.,33.3,7.1);
 for(var c=0;c<4;c++) {
  // Camera-relative coordinates plus per-cascade origin phase avoid both
  // kilometre-scale f32 jitter and seams when the floating origin changes.
  let phases=array<vec2f,4>(frame.ocean_phase[0].xy,frame.ocean_phase[0].zw,frame.ocean_phase[1].xy,frame.ocean_phase[1].zw);
  let uv=p/sizes[c]+phases[c];
  let lod=clamp(log2(max(footprint*256./sizes[c],1.)),0.,8.);
  let d=textureSampleLevel(ocean_displacement,ocean_sampler,uv,c,lod);
  let deriv=textureSampleLevel(ocean_derivatives,ocean_sampler,uv,c,lod);
  result.disp+=d.xyz;result.slope+=deriv.xy/(vec2f(1.)+deriv.zw);result.foam+=d.w;
  result.variance+=smoothstep(0.,6.,lod)*.0025;
 }return result;
}
struct WaterIn { @location(0) position:vec3f,@location(3) uv:vec2f }
struct Water { @builtin(position) clip:vec4f,@location(0) position:vec3f }
@vertex fn vs_water(v:WaterIn)->Water {
 var p=v.position+vec3f(floor(frame.camera.x/16.)*16.,.35-frame.origin.y,floor(frame.camera.z/16.)*16.);
 let sizes=array<f32,4>(733.,157.,33.3,7.1);
 let phases=array<vec2f,4>(frame.ocean_phase[0].xy,frame.ocean_phase[0].zw,frame.ocean_phase[1].xy,frame.ocean_phase[1].zw);
 var displacement=vec3f(0.);
 for(var c=0;c<4;c++) {let lod=clamp(log2(max(v.uv.x*128./sizes[c],1.)),0.,8.);displacement+=textureSampleLevel(ocean_displacement,ocean_sampler,p.xz/sizes[c]+phases[c],c,lod).xyz;}
 p+=displacement;
 var o:Water;o.position=p;o.clip=frame.view*vec4f(p,1.);return o;
}
@fragment fn fs_copy(v:Full)->@location(0) vec4f {
 let color=textureSampleLevel(opaque,ocean_sampler,clamp(v.uv,vec2f(.001),vec2f(.999)),0.).rgb;
 let depth=depth_at(v.uv);let p=unproject(v.uv,depth);let distance=length(p-frame.camera.xyz);
 let dx=dpdx(p);let dy=dpdy(p);var normal=normalize(cross(dx,dy));
 if dot(normal,frame.camera.xyz-p)<0.{normal=-normal;}
 var occlusion=0.;
 if depth>0.&&distance<180. {
  let radius=clamp(frame.viewport.y*1.1/max(distance,1.),2.,38.);
  for(var i=0;i<8;i++) {
   let angle=f32(i)*2.39996;let uv=v.uv+vec2f(cos(angle),sin(angle))*radius*(.35+.65*f32(i)/8.)/frame.viewport.xy;
   let delta=unproject(uv,depth_at(uv))-p;let d=length(delta);
   occlusion+=max(0.,dot(normal,delta)/max(d,.01)-.12)*(1.-smoothstep(.4,2.4,d))*smoothstep(.03,.12,d);
  }
 }
 return vec4f(color*exp(-occlusion*.32),1.);
}
@fragment fn fs_water(v:Water)->@location(0) vec4f {
 let uv=v.clip.xy/frame.viewport.xy;
 let original=textureSampleLevel(opaque,ocean_sampler,clamp(uv,vec2f(.001),vec2f(.999)),0.).rgb;
 let p=v.position;let ray=normalize(p-frame.camera.xyz);let t=length(p-frame.camera.xyz);
 let depth=depth_at(uv);let ground=unproject(uv,depth);let ground_t=length(ground-frame.camera.xyz);
 if depth>0.&&t>ground_t-.02{discard;}
 let sea_y=.35-frame.origin.y;
 let footprint=max(.01,max(length(dpdx(p.xz)),length(dpdy(p.xz))));
 let displaced=sea_sample(p.xz,footprint);
 let wave=sea_sample(p.xz-displaced.disp.xz,footprint);
    let n=normalize(vec3f(-wave.slope.x,1.,-wave.slope.y));let V=-ray;
    let nv=clamp(dot(n,V),0.,1.);let fresnel=.0204+.9796*pow(1.-nv,5.);
    var reflection=atmosphere(reflect(ray,n));
    // Screen-space reflected piers, boats and coastline. Missing rays fall
    // back smoothly to the atmospheric environment rather than dark streaks.
    let reflected=reflect(ray,n);var travel=1.5;
    for(var i=0;i<14;i++) {
     let q=p+reflected*travel;let clip=frame.view*vec4f(q,1.);let uv=clip.xy/clip.w*vec2f(.5,-.5)+.5;
     if all(uv>vec2f(.002))&&all(uv<vec2f(.998))&&clip.w>0. {
      let hit_d=depth_at(uv);let hit=unproject(uv,hit_d);let delta=length(q-frame.camera.xyz)-length(hit-frame.camera.xyz);
      if hit_d>0.&&delta>0.&&delta<1.5+travel*.035&&hit.y>sea_y-.05 {
       let edge=smoothstep(0.,.12,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
       reflection=mix(reflection,textureSampleLevel(opaque,ocean_sampler,uv,0.).rgb,edge*.85);break;
      }
     }
     travel=travel*1.48+1.;
    }
    let thickness=select(min(80.,max(.05,ground_t-t)*max(.08,-ray.y)),80.,depth<.0000001);
    let refract_uv=clamp(uv+n.xz*min(.014,thickness*.002),vec2f(.002),vec2f(.998));
    let refract_depth=depth_at(refract_uv);let refract_ground=unproject(refract_uv,refract_depth);
    let safe_uv=select(uv,refract_uv,refract_ground.y<sea_y);
    let bottom=textureSampleLevel(opaque,ocean_sampler,safe_uv,0.).rgb;
    let transmission=exp(-vec3f(.27,.095,.048)*thickness);
    let water=vec3f(.008,.065,.081)*(.16+.84*frame.sun.w);
    var refracted=mix(water,bottom,transmission);
    let caustic=pow(max(0.,sin(p.x*2.3+frame.params.x)+sin(p.z*2.1-frame.params.x*.7))*.5,8.);
    refracted+=vec3f(.07,.10,.07)*caustic*exp(-thickness*.6)*frame.sun.w;
    var col=mix(refracted,reflection,fresnel);
    let L=frame.sun.xyz;let H=normalize(L+V);let nh=max(0.,dot(n,H));let nl=max(0.,dot(n,L));
    let rough=.075+sqrt(wave.variance);let a=rough*rough;let den=nh*nh*(a*a-1.)+1.;
    let D=a*a/(3.14159*den*den);let k=rough*.5;let G=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);
    col+=sun_color()*min(vec3f(18.),vec3f(D*G*.0204/max(.03,4.*nv)));
    let shore=(1.-smoothstep(.08,.55,thickness))*smoothstep(.01,.12,thickness);
    let lace=fbm(p.xz*3.+vec2f(frame.params.x*.13,-frame.params.x*.09));
    let foam=clamp(wave.foam*.7+shore*smoothstep(.40,.72,lace+sin(thickness*9.-frame.params.x*1.6)*.12),0.,.92);
    col=mix(col,vec3f(.64,.70,.68)*(.14+.86*frame.sun.w),foam);
    col=mix(col,aerial(ray),1.-exp(-t/frame.params.z*1.55));
 return vec4f(col,1.);
}
