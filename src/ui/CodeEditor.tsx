// CodeMirror 6 编辑器：自定义 GLSL / HLSL / WGSL / ToySL 高亮 + 错误行标记
import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor, Decoration, type DecorationSet,
} from '@codemirror/view';
import { type Range } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle, foldGutter,
} from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { tags as t } from '@lezer/highlight';

// ---------- 词法器工厂 ----------

interface ModeSpec {
  keywords: string[];
  types: string[];
  builtins: string[];
  preproc?: boolean;
  atAttrs?: boolean;
}

const GLSL_MODE: ModeSpec = {
  preproc: true,
  keywords: [
    'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'discard',
    'const', 'struct', 'uniform', 'varying', 'attribute', 'in', 'out', 'inout',
    'layout', 'precision', 'flat', 'smooth', 'noperspective', 'centroid', 'invariant',
    'buffer', 'shared', 'coherent', 'volatile', 'restrict', 'readonly', 'writeonly',
    'switch', 'case', 'default', 'void', 'true', 'false', 'highp', 'mediump', 'lowp',
  ],
  types: [
    'bool', 'int', 'uint', 'float', 'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4',
    'uvec2', 'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4', 'mat2', 'mat3', 'mat4',
    'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DShadow', 'image2D', 'atomic_uint',
  ],
  builtins: [
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'pow', 'exp', 'log', 'exp2', 'log2',
    'sqrt', 'inversesqrt', 'abs', 'sign', 'floor', 'ceil', 'trunc', 'round', 'fract',
    'mod', 'modf', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'length',
    'distance', 'dot', 'cross', 'normalize', 'reflect', 'refract', 'faceforward',
    'matrixCompMult', 'outerProduct', 'transpose', 'determinant', 'inverse',
    'texture', 'textureLod', 'textureProj', 'textureGrad', 'texelFetch', 'dFdx', 'dFdy', 'fwidth',
    'gl_FragColor', 'gl_FragCoord', 'gl_Position', 'gl_PointSize', 'gl_VertexID', 'gl_InstanceID',
    'gl_FrontFacing', 'gl_FragDepth', 'gl_PointCoord',
  ],
};

const HLSL_MODE: ModeSpec = {
  preproc: true,
  keywords: [...GLSL_MODE.keywords, 'cbuffer', 'tbuffer', 'register', 'packoffset', 'inline', 'static'],
  types: [...GLSL_MODE.types, 'half', 'fixed', 'Texture1D', 'Texture2D', 'Texture3D', 'TextureCube'],
  builtins: [
    ...GLSL_MODE.builtins, 'mul', 'saturate', 'lerp', 'frac', 'atan2', 'rsqrt', 'ddx', 'ddy',
    'tex2D', 'clip', 'Sample', 'SampleLevel', 'Load', 'SV_Target', 'SV_Position', 'TEXCOORD0',
    'POSITION', 'NORMAL', 'TANGENT', 'COLOR0',
  ],
};

const WGSL_MODE: ModeSpec = {
  atAttrs: true,
  keywords: [
    'fn', 'var', 'let', 'const', 'struct', 'return', 'if', 'else', 'for', 'while', 'loop',
    'continuing', 'break', 'continue', 'discard', 'override', 'alias', 'true', 'false', 'bitcast',
  ],
  types: [
    'f32', 'f16', 'i32', 'u32', 'bool', 'vec2f', 'vec3f', 'vec4f', 'vec2i', 'vec3i', 'vec4i',
    'vec2u', 'vec3u', 'vec4u', 'vec2h', 'vec3h', 'vec4h', 'mat2x2f', 'mat3x3f', 'mat4x4f',
    'array', 'atomic', 'sampler', 'sampler_comparison', 'texture_2d', 'texture_3d',
    'texture_cube', 'texture_depth_2d', 'texture_storage_2d', 'texture_external',
  ],
  builtins: [
    'position', 'vertex_index', 'instance_index', 'front_facing', 'frag_depth',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'pow', 'exp', 'log', 'exp2', 'log2',
    'sqrt', 'inverseSqrt', 'abs', 'sign', 'floor', 'ceil', 'round', 'fract', 'min', 'max',
    'clamp', 'saturate', 'mix', 'step', 'smoothstep', 'length', 'distance', 'dot', 'cross',
    'normalize', 'reflect', 'refract', 'faceForward', 'transpose', 'determinant', 'inverse',
    'textureSample', 'textureSampleLevel', 'textureLoad', 'textureStore', 'textureDimensions',
  ],
};

const TOY_MODE: ModeSpec = {
  preproc: true,
  keywords: [...GLSL_MODE.keywords, 'param', 'include'],
  types: GLSL_MODE.types,
  builtins: GLSL_MODE.builtins,
};

function makeStreamMode(spec: ModeSpec) {
  const kw = new Set(spec.keywords);
  const ty = new Set(spec.types);
  const bi = new Set(spec.builtins);
  return StreamLanguage.define({
    name: 'shaderlab-mode',
    token(stream) {
      if (spec.atAttrs && stream.eat('@')) {
        stream.eatWhile(/[\w]/);
        return 'meta';
      }
      if (stream.match('//')) {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.match('/*')) {
        while (!stream.eol()) {
          if (stream.match('*/')) break;
          stream.next();
        }
        return 'comment';
      }
      if (spec.preproc && stream.match('#')) {
        stream.eatWhile(/\w/);
        return 'meta';
      }
      if (stream.match(/\d*\.\d+([eE][+-]?\d+)?[fh]?|\d+[fh]|\d+/)) return 'number';
      if (stream.eat('"')) {
        while (!stream.eol()) {
          if (stream.eat('"')) break;
          stream.next();
        }
        return 'string';
      }
      if (stream.match(/[A-Za-z_]\w*/)) {
        const word = stream.current();
        if (kw.has(word)) return 'keyword';
        if (ty.has(word)) return 'typeName';
        if (bi.has(word)) return 'standard(variableName)';
        return 'variableName';
      }
      if (stream.match(/[-+*/%=!<>&|^~?:]+/)) return 'operator';
      stream.next();
      return null;
    },
  });
}

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--code-keyword)' },
  { tag: t.typeName, color: 'var(--code-type)' },
  { tag: t.number, color: 'var(--code-number)' },
  { tag: t.comment, color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--code-string)' },
  { tag: t.meta, color: 'var(--code-builtin)' },
  { tag: t.standard(t.variableName), color: 'var(--code-builtin)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.operator, color: 'var(--text-dim)' },
  { tag: t.punctuation, color: 'var(--text-dim)' },
]);

// ---------- 自动补全 ----------

/** 内核按场景自动供应的 uniform（补全提示用） */
export const KERNEL_UNIFORM_HINTS: Record<'fullscreen' | 'mesh' | 'post', string[]> = {
  fullscreen: ['uTime', 'uDeltaTime', 'uFrame', 'uResolution', 'uInvResolution', 'uMouse', 'uCamPos', 'uCamRot'],
  mesh: ['uTime', 'uDeltaTime', 'uModel', 'uView', 'uProjection', 'uViewProj', 'uNormalMatrix', 'uCamPos', 'uLightDir', 'uLightViewProj', 'uShadowMap', 'uShadowTexel'],
  post: ['uTime', 'uResolution', 'uNear', 'uFar', 'uSceneTex', 'uNormalTex', 'uSceneDepth'],
};
export const SHADERTOY_HINTS = ['iTime', 'iTimeDelta', 'iFrame', 'iResolution', 'iMouse', 'iCamPos', 'iCamRot', 'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3'];

const BUILTIN_INFO = '内核内置 uniform —— 每帧自动供应，直接声明即可使用';

function makeCompletionSource(getSpec: () => ModeSpec, getHints: () => string[]) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\w]/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    const spec = getSpec();
    const options = [
      ...spec.builtins.map((k) => ({ label: k, type: 'function', boost: 1 })),
      ...spec.types.map((k) => ({ label: k, type: 'type' })),
      ...spec.keywords.map((k) => ({ label: k, type: 'keyword', boost: -1 })),
      ...getHints().map((k) => ({ label: k, type: 'variable', info: BUILTIN_INFO })),
    ];
    return { from: word.from, options, validFor: /^[\w]*$/ };
  };
}

// ---------- 错误行高亮 ----------

export const setErrorsEffect = StateEffect.define<number[]>();
const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco;
    for (const e of tr.effects) {
      if (e.is(setErrorsEffect)) {
        const doc = tr.state.doc;
        const ds: Range<Decoration>[] = [];
        for (const ln of e.value) {
          if (ln >= 1 && ln <= doc.lines) {
            ds.push(Decoration.line({ class: 'cm-error-line' }).range(doc.line(ln).from));
          }
        }
        next = Decoration.set(ds, true);
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---------- 组件 ----------

interface CodeEditorProps {
  code: string;
  mode: 'glsl' | 'hlsl' | 'wgsl' | 'toy';
  errorLines: number[];
  onChange: (code: string) => void;
  onApply: () => void;
  /** 补全提示的内核 uniform 列表（按场景） */
  hints?: string[];
}

export function CodeEditor({ code, mode, errorLines, onChange, onApply, hints = [] }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onApplyRef = useRef(onApply);
  const codeRef = useRef(code);
  const modeRef = useRef(mode);
  const hintsRef = useRef(hints);
  onChangeRef.current = onChange;
  onApplyRef.current = onApply;
  codeRef.current = code;
  modeRef.current = mode;
  hintsRef.current = hints;

  useEffect(() => {
    if (!hostRef.current) return;
    const spec = mode === 'wgsl' ? WGSL_MODE : mode === 'hlsl' ? HLSL_MODE : mode === 'toy' ? TOY_MODE : GLSL_MODE;
    const completionSource = makeCompletionSource(() => modeRef.current === 'wgsl' ? WGSL_MODE : modeRef.current === 'hlsl' ? HLSL_MODE : modeRef.current === 'toy' ? TOY_MODE : GLSL_MODE, () => hintsRef.current);
    const extensions: Extension[] = [
      lineNumbers(),
      foldGutter(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSelectionMatches(),
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      indentOnInput(),
      bracketMatching(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
      makeStreamMode(spec),
      syntaxHighlighting(highlight),
      autocompletion({ override: [completionSource], activateOnTyping: true }),
      errorField,
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
    ];
    const view = new EditorView({
      state: EditorState.create({ doc: codeRef.current, extensions }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 仅初始化一次；代码/模式变化通过下面的 effect 同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部代码替换（切换 pass / 预设 / 应用还原）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== code) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    }
  }, [code]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setErrorsEffect.of(errorLines) });
  }, [errorLines]);

  // Ctrl+Enter 应用
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onApplyRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 跳转到指定行（错误列表点击）
  useEffect(() => {
    const handler = (e: Event) => {
      const view = viewRef.current;
      const line = (e as CustomEvent<number>).detail;
      if (!view || typeof line !== 'number') return;
      const doc = view.state.doc;
      const ln = Math.min(Math.max(1, line), doc.lines);
      const info = doc.line(ln);
      view.dispatch({
        selection: { anchor: info.from },
        scrollIntoView: true,
      });
      view.focus();
    };
    window.addEventListener('shaderlab-goto', handler);
    return () => window.removeEventListener('shaderlab-goto', handler);
  }, []);

  return <div className="editor-host" ref={hostRef} />;
}
