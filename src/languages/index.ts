// 注册所有内置语言 + 暴露第三方插件 API
import { languages, installPublicAPI } from './registry';
import { glsl3Descriptor, glsl1Descriptor, translateGLSL } from './glsl';
import { shadertoy } from './shadertoy';
import { hlsl } from './hlsl';
import { toysl } from './toysl';
import { wgsl } from './wgsl-lang';
import type { PassDef, SceneConfig } from '../engine/types';

glsl3Descriptor.translate = (p: PassDef[], s: SceneConfig) => translateGLSL(p, s, 3);
glsl1Descriptor.translate = (p: PassDef[], s: SceneConfig) => translateGLSL(p, s, 1);

languages.register(glsl3Descriptor);
languages.register(glsl1Descriptor);
languages.register(shadertoy);
languages.register(hlsl);
languages.register(wgsl);
languages.register(toysl); // ← 通过同一套注册机制添加的"自定义语言"示例

installPublicAPI({
  registerToyLanguage: (descriptor: never) => languages.register(descriptor),
  version: '1.0.0',
});

export * from './registry';
export { hlslToGLSL } from './hlsl';
