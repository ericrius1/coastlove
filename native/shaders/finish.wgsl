@group(0) @binding(0) var scene:texture_2d<f32>;
@group(0) @binding(1) var samp:sampler;
struct V { @builtin(position) p:vec4f,@location(0) uv:vec2f }
@vertex fn vs(@builtin(vertex_index)i:u32)->V{var a=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));var v:V;v.p=vec4f(a[i],0.,1.);v.uv=a[i]*vec2f(0.5,-0.5)+0.5;return v;}
fn tone(c:vec3f)->vec3f{let x=c*1.1;return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),vec3f(0.),vec3f(1.));}
@fragment fn fs(v:V)->@location(0) vec4f {
 let d=1./vec2f(textureDimensions(scene));
 let hdr=textureSample(scene,samp,v.uv).rgb;
 // Small optical glow on lamps and sun glints, evaluated in linear HDR. Keep
 // the image sharp: 4x MSAA handles edges, so no full-scene blur is needed.
 var glow=vec3f(0.);
 for(var i=0;i<8;i++) {
  let angle=f32(i)*2.39996;let offset=vec2f(cos(angle),sin(angle))*d*(3.+f32(i)*2.);
  let sample=textureSampleLevel(scene,samp,v.uv+offset,0.).rgb;
  glow+=max(sample-vec3f(1.4),vec3f(0.))*.012;
 }
 let color=tone(hdr+glow);
 let vignette=1.-.10*dot(v.uv-.5,v.uv-.5);
 let srgb=mix(color*12.92,1.055*pow(max(color,vec3f(0.)),vec3f(1./2.4))-.055,step(vec3f(.0031308),color));
 return vec4f(srgb*vignette,1.);
}
