
import { parseExpression } from '@aurelia/jit';
import {
  Constructable,
  IContainer,
  IRegistry,
  IResourceDescriptions,
  PLATFORM,
  RuntimeCompilationResources
} from '@aurelia/kernel';
import {
  AccessScope,
  bindable,
  BindingIdentifier,
  BindingMode,
  BindingType,
  customAttribute,
  CustomAttributeResource,
  customElement,
  CustomElementResource,
  DelegationStrategy,
  ForOfStatement,
  HydrateTemplateController,
  IBindableDescription,
  IDOM,
  IHydrateElementInstruction,
  IHydrateTemplateController,
  ITemplateCompiler,
  ITemplateDefinition,
  PrimitiveLiteral,
  TargetedInstructionType as TT
} from '@aurelia/runtime';
import { HTMLTargetedInstructionType as HTT } from '@aurelia/runtime-html';
import { expect } from 'chai';
import { HTMLTestContext, TestContext } from '../util';
import { eachCartesianJoinFactory, verifyBindingInstructionsEqual } from './util';

export function createAttribute(name: string, value: string): Attr {
  const attr = document.createAttribute(name);
  attr.value = value;
  return attr;
}

describe('TemplateCompiler', () => {
  let ctx: HTMLTestContext;
  let sut: ITemplateCompiler;
  let resources: IResourceDescriptions;
  let container: IContainer;
  let dom: IDOM;

  beforeEach(() => {
    ctx = TestContext.createHTMLTestContext();
    container = ctx.container;
    sut = ctx.templateCompiler;
    container.registerResolver<string>(CustomAttributeResource.keyFrom('foo'), { getFactory: () => ({ Type: { description: {} } }) } as any);
    resources = new RuntimeCompilationResources(container);
    dom = ctx.dom;
  });

  describe('compileElement()', () => {

    it('set hasSlots to true <slot/>', () => {
      const definition = compileWith('<template><slot></slot></template>', []);
      expect(definition.hasSlots).to.equal(true);

      // test this with nested slot inside template controller
    });

    describe('with custom element', () => {

      describe('compiles surrogate', () => {

        it('compiles surrogate', () => {
          const { instructions, surrogates } = compileWith(
            `<template class="h-100"></template>`,
            []
          );
          verifyInstructions(instructions, []);
          verifyInstructions(surrogates, [
            { toVerify: ['type', 'value', 'to'], type: HTT.setAttribute, value: 'h-100', to: 'class' }
          ]);
        });

        it('compiles surrogate with binding expression', () => {
          const { instructions, surrogates } = compileWith(
            `<template class.bind="base"></template>`,
            []
          );
          verifyInstructions(instructions, [], 'normal');
          verifyInstructions(surrogates, [
            { toVerify: ['type', 'to'], type: TT.propertyBinding, to: 'class' }
          ],                 'surrogate');
        });

        it('compiles surrogate with interpolation expression', () => {
          const { instructions, surrogates } = compileWith(
            `<template class="h-100 \${base}"></template>`,
            []
          );
          verifyInstructions(instructions, [], 'normal');
          verifyInstructions(surrogates, [
            { toVerify: ['type', 'to'], type: TT.interpolation, to: 'class' }
          ],                 'surrogate');
        });

        it('throws on attributes that require to be unique', () => {
          const attrs = ['id', 'part', 'replace-part'];
          attrs.forEach(attr => {
            expect(() => compileWith(
              `<template ${attr}="${attr}"></template>`,
              []
            )).to.throw(/Invalid surrogate attribute/);
          });
        });
      });

      it('understands attr precendence: custom attr > element prop', () => {
        @customElement('el')
        class El {
          @bindable() public prop1: string;
          @bindable() public prop2: string;
          @bindable() public prop3: string;
        }

        @customAttribute('prop3')
        class Prop {}

        const actual = compileWith(
          `<template>
            <el prop1.bind="p" prop2.bind="p" prop3.bind="t" prop3="t"></el>
          </template>`,
          [El, Prop]
        );
        expect(actual.instructions.length).to.equal(1);
        expect(actual.instructions[0].length).to.equal(3);
        const siblingInstructions = actual.instructions[0].slice(1);
        const expectedSiblingInstructions = [
          { toVerify: ['type', 'res', 'to'], type: TT.hydrateAttribute, res: 'prop3' },
          { toVerify: ['type', 'res', 'to'], type: TT.hydrateAttribute, res: 'prop3' }
        ];
        verifyInstructions(siblingInstructions, expectedSiblingInstructions);
        const rootInstructions = actual.instructions[0][0]['instructions'];
        const expectedRootInstructions = [
          { toVerify: ['type', 'res', 'to'], type: TT.propertyBinding, to: 'prop1' },
          { toVerify: ['type', 'res', 'to'], type: TT.propertyBinding, to: 'prop2' }
        ];
        verifyInstructions(rootInstructions, expectedRootInstructions);
      });

      it('distinguishs element properties / normal attributes', () => {
        @customElement('el')
        class El {

          @bindable()
          public name: string;
        }

        const actual = compileWith(
          `<template>
            <el name="name" name2="label"></el>
          </template>`,
          [El]
        );
        const rootInstructions = actual.instructions[0];
        const expectedRootInstructions = [
          { toVerify: ['type', 'res'], type: TT.hydrateElement, res: 'el' }
        ];
        verifyInstructions(rootInstructions, expectedRootInstructions);

        const expectedElInstructions = [
          { toVerify: ['type', 'to', 'value'], type: TT.setProperty, to: 'name', value: 'name' }
        ];
        verifyInstructions(rootInstructions[0].instructions, expectedElInstructions);
      });

      it('understands element property casing', () => {
        @customElement('el')
        class El {

          @bindable()
          public backgroundColor: string;
        }

        const actual = compileWith(
          `<template>
            <el background-color="label"></el>
          </template>`,
          [El]
        );
        const rootInstructions = actual.instructions[0];

        const expectedElInstructions = [
          { toVerify: ['type', 'value', 'to'], type: TT.setProperty, value: 'label', to: 'backgroundColor' },
        ];
        verifyInstructions(rootInstructions[0].instructions, expectedElInstructions);
      });

      it('understands binding commands', () => {
        @customElement('el')
        class El {
          @bindable({ mode: BindingMode.twoWay }) public propProp1: string;
          @bindable() public prop2: string;
          @bindable() public propProp3: string;
          @bindable() public prop4: string;
          @bindable() public propProp5: string;
        }
        const actual = compileWith(
          `<template>
            <el
              prop-prop1.bind="prop1"
              prop2.one-time="prop2"
              prop-prop3.to-view="prop3"
              prop4.from-view="prop4"
              prop-prop5.two-way="prop5"
              ></el>
          </template>`,
          [El]
        );
        const rootInstructions = actual.instructions[0];

        const expectedElInstructions = [
          { toVerify: ['type', 'mode', 'to'], mode: BindingMode.twoWay, to: 'propProp1' },
          { toVerify: ['type', 'mode', 'to'], mode: BindingMode.oneTime, to: 'prop2' },
          { toVerify: ['type', 'mode', 'to'], mode: BindingMode.toView, to: 'propProp3' },
          { toVerify: ['type', 'mode', 'to'], mode: BindingMode.fromView, to: 'prop4' },
          { toVerify: ['type', 'mode', 'to'], mode: BindingMode.twoWay, to: 'propProp5' },
        ].map((e: any) => {
          e.type = TT.propertyBinding;
          return e;
        });
        verifyInstructions(rootInstructions[0].instructions, expectedElInstructions);
      });

      describe('with template controller', () => {
        it('compiles', () => {
          @customAttribute({
            name: 'prop',
            isTemplateController: true
          })
          class Prop {
            public value: any;
          }
          const { template, instructions } = compileWith(
            `<template><el prop.bind="p"></el></template>`,
            [Prop]
          );
          expect((template as HTMLTemplateElement).outerHTML).to.equal('<template><au-m class="au"></au-m></template>');
          const [hydratePropAttrInstruction] = instructions[0] as unknown as [HydrateTemplateController];
          expect((hydratePropAttrInstruction.def.template as HTMLTemplateElement).outerHTML).to.equal('<template><el></el></template>');
        });

        it('moves attrbiutes instructions before the template controller into it', () => {
          @customAttribute({
            name: 'prop',
            isTemplateController: true
          })
          class Prop {
            public value: any;
          }
          const { template, instructions } = compileWith(
            `<template><el name.bind="name" title.bind="title" prop.bind="p"></el></template>`,
            [Prop]
          );
          expect((template as HTMLTemplateElement).outerHTML).to.equal('<template><au-m class="au"></au-m></template>');
          const [hydratePropAttrInstruction] = instructions[0] as unknown as [HydrateTemplateController];
          verifyInstructions(hydratePropAttrInstruction.instructions, [
            { toVerify: ['type', 'to', 'from'],
              type: TT.propertyBinding, to: 'value', from: new AccessScope('p') }
          ]);
          verifyInstructions(hydratePropAttrInstruction.def.instructions[0], [
            { toVerify: ['type', 'to', 'from'],
              type: TT.propertyBinding, to: 'name', from: new AccessScope('name') },
            { toVerify: ['type', 'to', 'from'],
              type: TT.propertyBinding, to: 'title', from: new AccessScope('title') },
          ]);
        });

        describe('[as-element]', () => {
          it('understands [as-element]', () => {
            @customElement('not-div')
            class NotDiv {}
            const { instructions } = compileWith('<template><div as-element="not-div"></div></template>', [NotDiv]);
            verifyInstructions(instructions[0], [
              { toVerify: ['type', 'res'],
                type: TT.hydrateElement, res: 'not-div' }
            ]);
          });

          it('does not throw when element is not found', () => {
            const { instructions } = compileWith('<template><div as-element="not-div"></div></template>');
            expect(instructions.length).to.equal(0);
          });

          describe('with template controller', () => {
            it('compiles', () => {
              @customElement('not-div')
              class NotDiv {}
              const { instructions } = compileWith(
                '<template><div if.bind="value" as-element="not-div"></div></template>',
                [NotDiv]
              );

              verifyInstructions(instructions[0], [
                { toVerify: ['type', 'res', 'to'],
                  type: TT.hydrateTemplateController, res: 'if' }
              ]);
              const templateControllerInst = instructions[0][0] as IHydrateTemplateController;
              verifyInstructions(templateControllerInst.instructions, [
                { toVerify: ['type', 'to', 'from'],
                  type: TT.propertyBinding, to: 'value', from: new AccessScope('value') }
              ]);
              const [hydrateNotDivInstruction] = templateControllerInst.def.instructions[0] as [IHydrateElementInstruction];
              verifyInstructions([hydrateNotDivInstruction], [
                { toVerify: ['type', 'res'],
                  type: TT.hydrateElement, res: 'not-div' }
              ]);
              verifyInstructions(hydrateNotDivInstruction.instructions, []);
            });
          });
        });
      });

      describe('<let/> element', () => {

        it('compiles', () => {
          const { instructions } = compileWith(`<template><let></let></template>`);
          expect(instructions.length).to.equal(1);
        });

        it('does not generate instructions when there is no bindings', () => {
          const { instructions } = compileWith(`<template><let></let></template>`);
          expect((instructions[0][0]).instructions.length).to.equal(0);
        });

        it('ignores custom element resource', () => {
          @customElement('let')
          class Let {}

          const { instructions } = compileWith(
            `<template><let></let></template>`,
            [Let]
          );
          verifyInstructions(instructions[0], [
            { toVerify: ['type'], type: TT.hydrateLetElement }
          ]);
        });

        it('compiles with attributes', () => {
          const { instructions } = compileWith(`<let a.bind="b" c="\${d}"></let>`);
          verifyInstructions((instructions[0][0]).instructions, [
            { toVerify: ['type', 'to', 'srcOrExp'],
              type: TT.letBinding, to: 'a', from: 'b' },
            { toVerify: ['type', 'to'],
              type: TT.letBinding, to: 'c' }
          ]);
        });

        describe('[to-view-model]', () => {
          it('understands [to-view-model]', () => {
            const { instructions } = compileWith(`<template><let to-view-model></let></template>`);
            expect((instructions[0][0]).toViewModel).to.equal(true);
          });

          it('ignores [to-view-model] order', () => {
            let instructions = compileWith(`<template><let a.bind="a" to-view-model></let></template>`).instructions[0];
            verifyInstructions(instructions, [
              { toVerify: ['type', 'toViewModel'], type: TT.hydrateLetElement, toViewModel: true }
            ]);
            instructions = compileWith(`<template><let to-view-model a.bind="a"></let></template>`).instructions[0];
            verifyInstructions(instructions, [
              { toVerify: ['type', 'toViewModel'], type: TT.hydrateLetElement, toViewModel: true }
            ]);
          });
        });
      });
    });

    interface IExpectedInstruction {
      toVerify: string[];
      [prop: string]: any;
    }

    function compileWith(markup: string | Element, extraResources: any[] = []) {
      extraResources.forEach(e => e.register(container));
      // @ts-ignore
      return sut.compile(dom, { template: markup, instructions: [], surrogates: [] }, resources);
    }

    function verifyInstructions(actual: any[], expectation: IExpectedInstruction[], type?: string) {
      expect(actual.length).to.equal(expectation.length, `Expected to have ${expectation.length} ${type ? `${type} ` : ''} instructions. Received: ${actual.length}`);
      for (let i = 0, ii = actual.length; i < ii; ++i) {
        const actualInst = actual[i];
        const expectedInst = expectation[i];
        for (const prop of expectedInst.toVerify) {
          if (expectedInst[prop] instanceof Object) {
            expect(
              actualInst[prop]).to.deep.equal(
                expectedInst[prop],
                `Expected actual instruction ${type ? `of ${type}` : ''} to have "${prop}": ${expectedInst[prop]}. Received: ${actualInst[prop]} (on index: ${i})`
              );
          } else {
            expect(
              actualInst[prop]).to.equal(
                expectedInst[prop],
                `Expected actual instruction ${type ? `of ${type}` : ''} to have "${prop}": ${expectedInst[prop]}. Received: ${actualInst[prop]} (on index: ${i})`
              );
          }
        }
      }
    }
  });
});

function createTplCtrlAttributeInstruction(attr: string, value: string) {
  if (attr === 'repeat.for') {
    return [{
      type: TT.iteratorBinding,
      from: new ForOfStatement(
        new BindingIdentifier(value.split(' of ')[0]),
        new AccessScope(value.split(' of ')[1])),
      to: 'items'
    }];
  } else if (attr.indexOf('.') !== -1) {
    return [{
      type: TT.propertyBinding,
      from: value.length === 0 ? PrimitiveLiteral.$empty : new AccessScope(value),
      to: 'value',
      mode: BindingMode.toView,
      oneTime: false
    }];
  } else {
    return [{
      type: TT.setProperty,
      to: 'value',
      value
    }];
  }
}

function createTemplateController(ctx: HTMLTestContext, attr: string, target: string, value: string, tagName: string, finalize: boolean, childInstr?, childTpl?): CTCResult {
  // multiple template controllers per element
  if (tagName === null) {
    const node = ctx.createElementFromMarkup(childTpl) as Element;
    const attributes = [];
    while (node.attributes.length) {
      attributes.unshift(node.attributes[0]);
      node.removeAttribute(node.attributes[0].name);
    }
    node.setAttribute(attr, value);
    while (attributes.length) {
      const attr = attributes.pop();
      node.setAttribute(attr.name, attr.value);
    }
    node.setAttribute(attr, value);
    const rawMarkup = node.outerHTML;
    const instruction = {
      type: TT.hydrateTemplateController,
      res: target,
      def: {
        name: target,
        template: ctx.createElementFromMarkup(`<template><au-m class="au"></au-m></template>`),
        instructions: [[childInstr]],
        build: { required: false, compiler: 'default' }
      },
      instructions: createTplCtrlAttributeInstruction(attr, value),
      link: attr === 'else'
    };
    const input = {
      template: finalize ? `<div>${rawMarkup}</div>` : rawMarkup,
      instructions: []
    };
    const output = {
      template: ctx.createElementFromMarkup(`<template><div><au-m class="au"></au-m></div></template>`),
      instructions: [[instruction]]
    };
    // @ts-ignore
    return [input, output];
  } else {
    let compiledMarkup;
    let instructions;
    if (childInstr === undefined) {
      compiledMarkup = `<${tagName}></${tagName}>`;
      instructions = [];
    } else {
      compiledMarkup = `<${tagName}><au-m class="au"></au-m></${tagName}>`;
      instructions = [[childInstr]];
    }
    const instruction = {
      type: TT.hydrateTemplateController,
      res: target,
      def: {
        name: target,
        template: ctx.createElementFromMarkup(tagName === 'template' ? compiledMarkup : `<template>${compiledMarkup}</template>`),
        instructions,
        build: { required: false, compiler: 'default' }
      },
      instructions: createTplCtrlAttributeInstruction(attr, value),
      link: attr === 'else'
    };
    const rawMarkup = `<${tagName} ${attr}="${value || ''}">${childTpl || ''}</${tagName}>`;
    const input = {
      template: finalize ? `<div>${rawMarkup}</div>` : rawMarkup,
      instructions: []
    };
    const output = {
      template: ctx.createElementFromMarkup(finalize ? `<template><div><au-m class="au"></au-m></div></template>` : `<au-m class="au"></au-m>`),
      instructions: [[instruction]]
    };
    // @ts-ignore
    return [input, output];
  }
}

function createCustomElement(ctx: HTMLTestContext, tagName: string, finalize: boolean, attributes: [string, string][], childInstructions: any[], siblingInstructions: any[], nestedElInstructions: any[], childOutput?, childInput?) {
  const instruction = {
    type: TT.hydrateElement,
    res: tagName,
    instructions: childInstructions,
    parts: PLATFORM.emptyObject
  };
  const attributeMarkup = attributes.map(a => `${a[0]}="${a[1]}"`).join(' ');
  const rawMarkup = `<${tagName} ${attributeMarkup}>${(childInput && childInput.template) || ''}</${tagName}>`;
  const input = {
    template: finalize ? `<div>${rawMarkup}</div>` : rawMarkup,
    instructions: []
  };
  const outputMarkup = ctx.createElementFromMarkup(`<${tagName} ${attributeMarkup}>${(childOutput && childOutput.template.outerHTML) || ''}</${tagName}>`) as HTMLElement;
  outputMarkup.classList.add('au');
  const output = {
    template: finalize ? ctx.createElementFromMarkup(`<template><div>${outputMarkup.outerHTML}</div></template>`) : outputMarkup,
    instructions: [[instruction, ...siblingInstructions], ...nestedElInstructions]
  };
  return [input, output];
}

function createCustomAttribute(ctx: HTMLTestContext, resName: string, finalize: boolean, attributes: [string, string][], childInstructions: any[], siblingInstructions: any[], nestedElInstructions: any[], childOutput?, childInput?) {
  const instruction = {
    type: TT.hydrateAttribute,
    res: resName,
    instructions: childInstructions
  };
  const attributeMarkup = attributes.map(a => `${a[0]}: ${a[1]};`).join('');
  const rawMarkup = `<div ${resName}="${attributeMarkup}">${(childInput && childInput.template) || ''}</div>`;
  const input = {
    template: finalize ? `<div>${rawMarkup}</div>` : rawMarkup,
    instructions: []
  };
  const outputMarkup = ctx.createElementFromMarkup(`<div ${resName}="${attributeMarkup}">${(childOutput && childOutput.template.outerHTML) || ''}</div>`) as HTMLElement;
  outputMarkup.classList.add('au');
  const output = {
    template: finalize ? ctx.createElementFromMarkup(`<template><div>${outputMarkup.outerHTML}</div></template>`) : outputMarkup,
    instructions: [[instruction, ...siblingInstructions], ...nestedElInstructions]
  };
  return [input, output];
}

const commandToMode = {
  'one-time': BindingMode.oneTime,
  'to-view': BindingMode.toView,
  'from-view': BindingMode.fromView,
  'two-way': BindingMode.twoWay
};

const validCommands = ['bind', 'one-time', 'to-view', 'from-view', 'two-way', 'trigger', 'delegate', 'capture', 'call'];

function createAttributeInstruction(bindable: IBindableDescription | null, attributeName: string, attributeValue: string, isMulti: boolean) {
  const parts = attributeName.split('.');
  const attr = parts[0];
  const cmd = parts.pop();
  const defaultMode = !!bindable ? (bindable.mode === BindingMode.default ? BindingMode.toView : bindable.mode) : BindingMode.toView;
  const mode = commandToMode[cmd] || defaultMode;
  const oneTime = mode === BindingMode.oneTime;

  if (!!bindable) {
    if (!!cmd && validCommands.indexOf(cmd) !== -1) {
      const type = TT.propertyBinding;
      const to = bindable.property;
      const from = parseExpression(attributeValue);
      return { type, to, mode, from, oneTime };
    } else {
      const from = parseExpression(attributeValue, BindingType.Interpolation);
      if (!!from) {
        const type = TT.interpolation;
        const to = bindable.property;
        return { type, to, from };
      } else {
        const type = TT.setProperty;
        const to = bindable.property;
        const value = attributeValue;
        return { type, to, value };
      }
    }
  } else {
    const type = TT.propertyBinding;
    const to = attr;
    if (!!cmd && validCommands.indexOf(cmd) !== -1) {
      const from = parseExpression(attributeValue);
      return { type, to, mode, from, oneTime };
    } else {
      const from = parseExpression(attributeValue, BindingType.Interpolation);
      if (!!from) {
        const type = TT.interpolation;
        return { type, to, from };
      } else if (isMulti) {
        const type = TT.setProperty;
        const to = attr;
        const value = attributeValue;
        return { type, to, value };
      } else {
        return null;
      }
    }
  }
}

type CTCResult = [ITemplateDefinition, ITemplateDefinition];

type Bindables = { [pdName: string]: IBindableDescription };

describe(`TemplateCompiler - combinations`, () => {
  function setup(ctx: HTMLTestContext, ...globals: IRegistry[]) {
    const container = ctx.container;
    container.register(...globals);
    const sut = ctx.templateCompiler;
    const dom = ctx.dom;
    const resources = new RuntimeCompilationResources(container);
    return { container, dom, sut, resources };
  }

  describe('plain attributes', () => {
    eachCartesianJoinFactory([
      [
        TestContext.createHTMLTestContext
      ],
      [
        (ctx) => ['div']
      ] as ((ctx: HTMLTestContext) => [string])[],
      [
        (ctx) => ['foo', 'foo', 'bar'],
        (ctx) => ['foo.bar', 'foo', 'bar'],
        (ctx) => ['foo.bind', 'foo', 'bar'],
        (ctx) => ['value', 'value', 'value']
      ] as ((ctx: HTMLTestContext, $1: [string]) => [string, string, string])[],
      [
        (ctx, $1, [, , value]) => [`ref`,               value, { type: TT.refBinding,      from: value }],
        (ctx, $1, [attr, to, value]) => [`${attr}.bind`,      value, { type: TT.propertyBinding, from: new AccessScope(value), to, mode: BindingMode.toView,   oneTime: false }],
        (ctx, $1, [attr, to, value]) => [`${attr}.to-view`,   value, { type: TT.propertyBinding, from: new AccessScope(value), to, mode: BindingMode.toView,   oneTime: false }],
        (ctx, $1, [attr, to, value]) => [`${attr}.one-time`,  value, { type: TT.propertyBinding, from: new AccessScope(value), to, mode: BindingMode.oneTime,  oneTime: true  }],
        (ctx, $1, [attr, to, value]) => [`${attr}.from-view`, value, { type: TT.propertyBinding, from: new AccessScope(value), to, mode: BindingMode.fromView, oneTime: false }],
        (ctx, $1, [attr, to, value]) => [`${attr}.two-way`,   value, { type: TT.propertyBinding, from: new AccessScope(value), to, mode: BindingMode.twoWay,   oneTime: false }],
        (ctx, $1, [attr, to, value]) => [`${attr}.trigger`,   value, { type: HTT.listenerBinding, from: new AccessScope(value), to, strategy: DelegationStrategy.none,      preventDefault: true }],
        (ctx, $1, [attr, to, value]) => [`${attr}.delegate`,  value, { type: HTT.listenerBinding, from: new AccessScope(value), to, strategy: DelegationStrategy.bubbling,  preventDefault: false }],
        (ctx, $1, [attr, to, value]) => [`${attr}.capture`,   value, { type: HTT.listenerBinding, from: new AccessScope(value), to, strategy: DelegationStrategy.capturing, preventDefault: false }],
        (ctx, $1, [attr, to, value]) => [`${attr}.call`,      value, { type: TT.callBinding,     from: new AccessScope(value), to }]
      ] as ((ctx: HTMLTestContext, $1: [string], $2: [string, string, string]) => [string, string, any])[]
    ],                       (ctx, [el], $2, [n1, v1, i1]) => {
      const markup = `<${el} ${n1}="${v1}"></${el}>`;

      it(markup, () => {
        const input = { template: markup, instructions: [], surrogates: [] };
        const expected = { template: ctx.createElementFromMarkup(`<template><${el} ${n1}="${v1}" class="au"></${el}></template>`), instructions: [[i1]], surrogates: [] };

        const { sut, resources, dom } = setup(ctx);

        // @ts-ignore
        const actual = sut.compile(dom, input, resources);

        verifyBindingInstructionsEqual(actual, expected);
      });
    });
  });

  describe('custom attributes', () => {
    eachCartesianJoinFactory([
      [
        TestContext.createHTMLTestContext
      ],
      // IAttributeDefinition.bindables
      [
        (ctx) => [undefined, undefined, 'value'],
        (ctx) => [{}, undefined,  'value'],
        (ctx) => [{ asdf: { attribute: 'bazBaz', property: 'bazBaz', mode: BindingMode.oneTime } }, BindingMode.oneTime, 'bazBaz'],
        (ctx) => [{ asdf: { attribute: 'bazBaz', property: 'bazBaz', mode: BindingMode.fromView } }, BindingMode.fromView, 'bazBaz'],
        (ctx) => [{ asdf: { attribute: 'bazBaz', property: 'bazBaz', mode: BindingMode.twoWay } }, BindingMode.twoWay, 'bazBaz'],
        (ctx) => [{ asdf: { attribute: 'bazBaz', property: 'bazBaz', mode: BindingMode.default } }, BindingMode.default, 'bazBaz']
      ] as ((ctx: HTMLTestContext) => [Record<string, IBindableDescription> | undefined, BindingMode | undefined, string])[],
      [
        (ctx) => ['foo',     '', class Foo {}],
        (ctx) => ['foo-foo', '', class FooFoo {}],
        (ctx) => ['foo',     'bar', class Foo {}],
        (ctx) => ['foo-foo', 'bar', class Foo {}]
      ] as ((ctx: HTMLTestContext) => [string, string, Constructable])[],
      // IAttributeDefinition.defaultBindingMode
      [
        (ctx) => undefined,
        (ctx) => BindingMode.oneTime,
        (ctx) => BindingMode.toView,
        (ctx) => BindingMode.fromView,
        (ctx) => BindingMode.twoWay
      ] as ((ctx: HTMLTestContext) => BindingMode | undefined)[],
      [
        (ctx, [,, to], [attr, value]) => [`${attr}`,           { type: TT.setProperty, to, value }],
        (ctx, [, mode, to], [attr, value], defaultMode) => [`${attr}.bind`,      { type: TT.propertyBinding, from: value.length > 0 ? new AccessScope(value) : new PrimitiveLiteral(value), to, mode: (mode && mode !== BindingMode.default) ? mode : (defaultMode || BindingMode.toView) }],
        (ctx, [, , to],      [attr, value]) => [`${attr}.to-view`,   { type: TT.propertyBinding, from: value.length > 0 ? new AccessScope(value) : new PrimitiveLiteral(value), to, mode: BindingMode.toView }],
        (ctx, [, , to],      [attr, value]) => [`${attr}.one-time`,  { type: TT.propertyBinding, from: value.length > 0 ? new AccessScope(value) : new PrimitiveLiteral(value), to, mode: BindingMode.oneTime }],
        (ctx, [, , to],      [attr, value]) => [`${attr}.from-view`, { type: TT.propertyBinding, from: value.length > 0 ? new AccessScope(value) : new PrimitiveLiteral(value), to, mode: BindingMode.fromView }],
        (ctx, [, , to],      [attr, value]) => [`${attr}.two-way`,   { type: TT.propertyBinding, from: value.length > 0 ? new AccessScope(value) : new PrimitiveLiteral(value), to, mode: BindingMode.twoWay }]
      ] as ((ctx: HTMLTestContext, $1: [Record<string, IBindableDescription>, BindingMode, string], $2: [string, string, Constructable], $3: BindingMode) => [string, any])[]
    ],                       (ctx, [bindables], [attr, value, ctor], defaultBindingMode, [name, childInstruction]) => {
      if (childInstruction.mode !== undefined) {
        childInstruction.oneTime = childInstruction.mode === BindingMode.oneTime;
      }
      const def = { name: PLATFORM.camelCase(attr), defaultBindingMode, bindables };
      const markup = `<div ${name}="${value}"></div>`;

      it(`${markup}  CustomAttribute=${JSON.stringify(def)}`, () => {
        const input = { template: markup, instructions: [], surrogates: [] };
        const instruction = { type: TT.hydrateAttribute, res: def.name, instructions: [childInstruction] };
        const expected = { template: ctx.createElementFromMarkup(`<template><div ${name}="${value}" class="au"></div></template>`), instructions: [[instruction]], surrogates: [] };

        const $def = CustomAttributeResource.define(def, ctor);
        const { sut, resources, dom  } = setup(ctx, $def);

        // @ts-ignore
        const actual = sut.compile(dom, input, resources);

        verifyBindingInstructionsEqual(actual, expected);
      });
    });
  });

  describe('custom attributes with multiple bindings', () => {

    eachCartesianJoinFactory([
      [
        TestContext.createHTMLTestContext
      ],
      [
        (ctx) => 'foo',
        (ctx) => 'bar42'
      ] as ((ctx: HTMLTestContext) => string)[],
      [
        (ctx, pdName) => pdName,
        (ctx, pdName) => `${pdName}Bar` // descriptor.property is different from the actual property name
      ] as ((ctx: HTMLTestContext, $1: string) => string)[],
      [
        (ctx, pdName, pdProp) => ({ [pdName]: { property: pdProp, attribute: PLATFORM.kebabCase(pdProp), mode: BindingMode.default  } }),
        (ctx, pdName, pdProp) => ({ [pdName]: { property: pdProp, attribute: PLATFORM.kebabCase(pdProp), mode: BindingMode.oneTime  } }),
        (ctx, pdName, pdProp) => ({ [pdName]: { property: pdProp, attribute: PLATFORM.kebabCase(pdProp), mode: BindingMode.toView   } }),
        (ctx, pdName, pdProp) => ({ [pdName]: { property: pdProp, attribute: PLATFORM.kebabCase(pdProp), mode: BindingMode.fromView } }),
        (ctx, pdName, pdProp) => ({ [pdName]: { property: pdProp, attribute: PLATFORM.kebabCase(pdProp), mode: BindingMode.twoWay   } })
      ] as ((ctx: HTMLTestContext, $1: string, $2: string) => Bindables)[],
      [
        (ctx) => [``,           `''`],
        (ctx) => [``,           `\${a}`],
        (ctx) => [`.bind`,      `''`],
        (ctx) => [`.one-time`,  `''`],
        (ctx) => [`.to-view`,   `''`],
        (ctx) => [`.from-view`, `''`],
        (ctx) => [`.two-way`,   `''`]
      ] as ((ctx: HTMLTestContext) => [string, string])[],
      [
        (ctx, pdName, pdProp, bindables, [cmd]) => [bindables[pdName], `${pdProp}${cmd}`],
        (ctx, pdName, pdProp, bindables, [cmd]) => [bindables[pdName], `${pdProp}.qux${cmd}`],
        (ctx, pdName, pdProp, bindables, [cmd]) => [null,              `${pdProp}Qux${cmd}`]
        // TODO: test fallback to attribute name when no matching binding exists (or throw if we don't want to support this)
      ] as ((ctx: HTMLTestContext, $1: string, $2: string, $3: Bindables, $4: [string, string]) => [IBindableDescription, string])[]
    ],                       (ctx, pdName, pdProp, bindables, [cmd, attrValue], [bindable, attrName]) => {
      it(`div - pdName=${pdName}  pdProp=${pdProp}  cmd=${cmd}  attrName=${attrName}  attrValue="${attrValue}"`, () => {

        const { sut, resources, dom  } = setup(
          ctx,
          CustomAttributeResource.define({ name: 'asdf', bindables, hasDynamicOptions: true }, class FooBar {})
        );

        const instruction = createAttributeInstruction(bindable, attrName, attrValue, true);

        const [input, output] = createCustomAttribute(ctx, 'asdf', true, [[attrName, attrValue]], [instruction], [], []);

        if (attrName.endsWith('.qux')) {
          let e;
          try {
            // @ts-ignore
            sut.compile(dom, input, resources);
          } catch (err) {
            //console.log('EXPECTED: ', JSON.stringify(output.instructions[0][0], null, 2));
            //console.log('ACTUAL: ', JSON.stringify(actual.instructions[0][0], null, 2));
            e = err;
          }
          expect(e).to.be.an('Error');
        } else {
          // enableTracing();
          // Tracer.enableLiveLogging(SymbolTraceWriter);
          // @ts-ignore
          const actual = sut.compile(dom, input, resources);
          // console.log('\n'+stringifyTemplateDefinition(actual, 0));
          // disableTracing();
          try {
            verifyBindingInstructionsEqual(actual, output);
          } catch (err) {
            //console.log('EXPECTED: ', JSON.stringify(output.instructions[0][0], null, 2));
            //console.log('ACTUAL: ', JSON.stringify(actual.instructions[0][0], null, 2));
            throw err;
          }
        }
      });
    });
  });

  describe('nested template controllers (one per element)', () => {

    eachCartesianJoinFactory([
      [
        TestContext.createHTMLTestContext
      ],
      [
        (ctx) => createTemplateController(ctx, 'foo',        'foo',    '',              'div',      false),
        (ctx) => createTemplateController(ctx, 'foo',        'foo',    'bar',           'div',      false),
        (ctx) => createTemplateController(ctx, 'if.bind',    'if',     'show',          'div',      false),
        (ctx) => createTemplateController(ctx, 'if.bind',    'if',     'show',          'template', false),
        (ctx) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div',      false),
        (ctx) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'template', false)
      ] as ((ctx: HTMLTestContext) => CTCResult)[],
      [
        (ctx, [input, output]) => createTemplateController(ctx, 'foo',        'foo',    '',              'div',      false, output.instructions[0][0], input.template),
        (ctx, [input, output]) => createTemplateController(ctx, 'foo',        'foo',    'bar',           'div',      false, output.instructions[0][0], input.template),
        (ctx, [input, output]) => createTemplateController(ctx, 'if.bind',    'if',     'show',          'div',      false, output.instructions[0][0], input.template),
        (ctx, [input, output]) => createTemplateController(ctx, 'else',       'else',   '',              'div',      false, output.instructions[0][0], input.template),
        (ctx, [input, output]) => createTemplateController(ctx, 'else',       'else',   '',              'template', false, output.instructions[0][0], input.template),
        (ctx, [input, output]) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div',      false, output.instructions[0][0], input.template),
        (ctx, [input, output]) => createTemplateController(ctx, 'with.bind',  'with',   'foo',           'div',      false, output.instructions[0][0], input.template),
        (ctx, [input, output]) => createTemplateController(ctx, 'with.bind',  'with',   'foo',           'template', false, output.instructions[0][0], input.template)
      ] as ((ctx: HTMLTestContext, $1: CTCResult) => CTCResult)[],
      [
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'foo',        'foo',    '',              'div',      false, output.instructions[0][0], input.template),
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'foo',        'foo',    'bar',           'div',      false, output.instructions[0][0], input.template),
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'foo',        'foo',    'bar',           'template', false, output.instructions[0][0], input.template),
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div',      false, output.instructions[0][0], input.template),
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'template', false, output.instructions[0][0], input.template)
      ] as ((ctx: HTMLTestContext, $1: CTCResult, $2: CTCResult) => CTCResult)[],
      [
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'bar',        'bar',    '',              'div',      true, output.instructions[0][0], input.template),
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'bar',        'bar',    'baz',           'div',      true, output.instructions[0][0], input.template),
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'bar',        'bar',    'baz',           'template', true, output.instructions[0][0], input.template),
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div',      true, output.instructions[0][0], input.template),
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'template', true, output.instructions[0][0], input.template)
      ] as ((ctx: HTMLTestContext, $1: CTCResult, $2: CTCResult, $3: CTCResult) => CTCResult)[]
    ],                       (ctx, $1, $2, $3, [input, output]) => {

      it(`${input.template}`, () => {

        const { sut, resources, dom } = setup(
          ctx,
          CustomAttributeResource.define({ name: 'foo', isTemplateController: true }, class Foo {}),
          CustomAttributeResource.define({ name: 'bar', isTemplateController: true }, class Bar {}),
          CustomAttributeResource.define({ name: 'baz', isTemplateController: true }, class Baz {}),
          CustomAttributeResource.define({ name: 'qux', isTemplateController: true }, class Qux {})
        );

        const actual = sut.compile(dom, input, resources);
        try {
          verifyBindingInstructionsEqual(actual, output);
        } catch (err) {
          //console.log('EXPECTED: ', JSON.stringify(output.instructions[0][0], null, 2));
          //console.log('ACTUAL: ', JSON.stringify(actual.instructions[0][0], null, 2));
          throw err;
        }
      });
    });
  });

  describe('nested template controllers (multiple per element)', () => {

    eachCartesianJoinFactory([
      [
        TestContext.createHTMLTestContext
      ],
      [
        (ctx) => createTemplateController(ctx, 'foo',        'foo',    '',              'div',      false),
        (ctx) => createTemplateController(ctx, 'foo',        'foo',    'bar',           'div',      false),
        (ctx) => createTemplateController(ctx, 'if.bind',    'if',     'show',          'div',      false),
        (ctx) => createTemplateController(ctx, 'if.bind',    'if',     'show',          'template', false),
        (ctx) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div',      false),
        (ctx) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'template', false)
      ] as ((ctx: HTMLTestContext) => CTCResult)[],
      [
        (ctx, [input, output]) => createTemplateController(ctx, 'bar',        'bar',    '',              null,       false, output.instructions[0][0], input.template),
        (ctx, [input, output]) => createTemplateController(ctx, 'else',       'else',   '',              null,       false, output.instructions[0][0], input.template),
        (ctx, [input, output]) => createTemplateController(ctx, 'with.bind',  'with',   'foo',           null,       false, output.instructions[0][0], input.template)
      ] as ((ctx: HTMLTestContext, $1: CTCResult) => CTCResult)[],
      [
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'foo',        'foo',    '',              'div',      false, output.instructions[0][0], input.template),
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'foo',        'foo',    'bar',           'div',      false, output.instructions[0][0], input.template),
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'foo',        'foo',    'bar',           'template', false, output.instructions[0][0], input.template),
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'baz',        'baz',    '',              null,       false, output.instructions[0][0], input.template),
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div',      false, output.instructions[0][0], input.template),
        (ctx, $1, [input, output]) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'template', false, output.instructions[0][0], input.template)
      ] as ((ctx: HTMLTestContext, $1: CTCResult, $2: CTCResult) => CTCResult)[],
      [
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'qux',        'qux',    '',              null,       false, output.instructions[0][0], input.template),
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'if.bind',    'if',     '',              'template', false, output.instructions[0][0], input.template),
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'if.bind',    'if',     '',              'div',      false, output.instructions[0][0], input.template),
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div',      false, output.instructions[0][0], input.template),
        (ctx, $1, $2, [input, output]) => createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'template', false, output.instructions[0][0], input.template)
      ] as ((ctx: HTMLTestContext, $1: CTCResult, $2: CTCResult, $3: CTCResult) => CTCResult)[],
      [
        (ctx, $1, $2, $3, [input, output]) => createTemplateController(ctx, 'quux',       'quux',   '',              null,       true, output.instructions[0][0], input.template)
      ] as ((ctx: HTMLTestContext, $1: CTCResult, $2: CTCResult, $3: CTCResult, $4: CTCResult) => CTCResult)[]
    ],                       (ctx, $1, $2, $3, $4, [input, output]) => {

      it(`${input.template}`, () => {

        const { sut, resources, dom } = setup(
          ctx,
          CustomAttributeResource.define({ name: 'foo',  isTemplateController: true }, class Foo {}),
          CustomAttributeResource.define({ name: 'bar',  isTemplateController: true }, class Bar {}),
          CustomAttributeResource.define({ name: 'baz',  isTemplateController: true }, class Baz {}),
          CustomAttributeResource.define({ name: 'qux',  isTemplateController: true }, class Qux {}),
          CustomAttributeResource.define({ name: 'quux', isTemplateController: true }, class Quux {})
        );

        const actual = sut.compile(dom, input, resources);
        try {
          verifyBindingInstructionsEqual(actual, output);
        } catch (err) {
          //console.log('EXPECTED: ', JSON.stringify(output.instructions[0][0], null, 2));
          //console.log('ACTUAL: ', JSON.stringify(actual.instructions[0][0], null, 2));
          throw err;
        }
      });
    });
  });

  describe('sibling template controllers', () => {

    eachCartesianJoinFactory([
      [
        TestContext.createHTMLTestContext
      ],
      [
        (ctx) => []
      ] as ((ctx: HTMLTestContext) => CTCResult[])[],
      [
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'foo',        'foo',    '',              'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'foo',        'foo',    '',              'template', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'foo',        'foo',    'bar',           'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'if.bind',    'if',     'show',          'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div', false)); }
      ] as ((ctx: HTMLTestContext, results: CTCResult[]) => void)[],
      [
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'foo',        'foo',    '',              'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'foo',        'foo',    'bar',           'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'if.bind',    'if',     'show',          'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'if.bind',    'if',     'show',          'template', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'else',       'else',   '',              'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'template', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'with.bind',  'with',   'bar',           'div', false)); }
      ] as ((ctx: HTMLTestContext, results: CTCResult[]) => void)[],
      [
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'foo',        'foo',    '',              'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'foo',        'foo',    'bar',           'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'div', false)); },
        (ctx, results: CTCResult[]) => { results.push(createTemplateController(ctx, 'repeat.for', 'repeat', 'item of items', 'template', false)); }
      ] as ((ctx: HTMLTestContext, results: CTCResult[]) => void)[]
    ],                       (ctx, [[input1, output1], [input2, output2], [input3, output3]]) => {
      const input = {
        template: `<div>${input1.template}${input2.template}${input3.template}</div>`,
        instructions: []
      };

      it(`${input.template}`, () => {

        const { sut, resources, dom } = setup(
          ctx,
          CustomAttributeResource.define({ name: 'foo', isTemplateController: true }, class Foo {}),
          CustomAttributeResource.define({ name: 'bar', isTemplateController: true }, class Bar {}),
          CustomAttributeResource.define({ name: 'baz', isTemplateController: true }, class Baz {})
        );

        const output = {
          // @ts-ignore
          template: ctx.createElementFromMarkup(`<template><div>${output1.template['outerHTML']}${output2.template['outerHTML']}${output3.template['outerHTML']}</div></template>`),
          instructions: [output1.instructions[0], output2.instructions[0], output3.instructions[0]]
        };
        //enableTracing();
        //Tracer.enableLiveLogging(SymbolTraceWriter);
        // @ts-ignore
        const actual = sut.compile(dom, input, resources);
        //console.log('\n'+stringifyTemplateDefinition(actual, 0));
        //disableTracing();
        try {
          verifyBindingInstructionsEqual(actual, output);
        } catch (err) {
          //console.log('EXPECTED: ', JSON.stringify(output.instructions, null, 2));
          //console.log('ACTUAL: ', JSON.stringify(actual.instructions, null, 2));
          throw err;
        }
      });
    });
  });

  describe('attributes on custom elements', () => {
    eachCartesianJoinFactory([
      [
        TestContext.createHTMLTestContext
      ],
      [
        (ctx) => 'foo',
        (ctx) => 'bar42'
      ] as ((ctx: HTMLTestContext) => string)[],
      [
        (ctx, pdName) => pdName,
        (ctx, pdName) => `${pdName}Bar` // descriptor.property is different from the actual property name
      ] as ((ctx: HTMLTestContext, $1: string) => string)[],
      [
        (ctx, pdName, pdProp) => PLATFORM.kebabCase(pdProp),
        (ctx, pdName, pdProp) => `${PLATFORM.kebabCase(pdProp)}-baz` // descriptor.attribute is different from kebab-cased descriptor.property
      ] as ((ctx: HTMLTestContext, $1: string, $2: string) => string)[],
      [
        (ctx, pdName, pdProp, pdAttr) => ({ [pdName]: { property: pdProp, attribute: pdAttr, mode: BindingMode.default  } }),
        (ctx, pdName, pdProp, pdAttr) => ({ [pdName]: { property: pdProp, attribute: pdAttr, mode: BindingMode.oneTime  } }),
        (ctx, pdName, pdProp, pdAttr) => ({ [pdName]: { property: pdProp, attribute: pdAttr, mode: BindingMode.toView   } }),
        (ctx, pdName, pdProp, pdAttr) => ({ [pdName]: { property: pdProp, attribute: pdAttr, mode: BindingMode.fromView } }),
        (ctx, pdName, pdProp, pdAttr) => ({ [pdName]: { property: pdProp, attribute: pdAttr, mode: BindingMode.twoWay   } })
      ] as ((ctx: HTMLTestContext, $1: string, $2: string, $3: string) => Bindables)[],
      [
        (ctx) => [``,           `''`],
        (ctx) => [``,           `\${a}`],
        (ctx) => [`.bind`,      `''`],
        (ctx) => [`.one-time`,  `''`],
        (ctx) => [`.to-view`,   `''`],
        (ctx) => [`.from-view`, `''`],
        (ctx) => [`.two-way`,   `''`]
      ] as ((ctx: HTMLTestContext) => [string, string])[],
      [
        (ctx, pdName, pdProp, pdAttr, bindables, [cmd]) => [bindables[pdName], `${pdAttr}${cmd}`],
        (ctx, pdName, pdProp, pdAttr, bindables, [cmd]) => [bindables[pdName], `${pdAttr}.qux${cmd}`],
        (ctx, pdName, pdProp, pdAttr, bindables, [cmd]) => [null,              `${pdAttr}-qux${cmd}`]
      ] as ((ctx: HTMLTestContext, $1: string, $2: string, $3: string, $4: Bindables, $5: [string, string]) => [IBindableDescription, string])[],
      [
        (ctx) => `''`
      ] as ((ctx: HTMLTestContext) => string)[]
    ],                       (ctx, pdName, pdProp, pdAttr, bindables, [cmd, attrValue], [bindable, attrName]) => {
      it(`customElement - pdName=${pdName}  pdProp=${pdProp}  pdAttr=${pdAttr}  cmd=${cmd}  attrName=${attrName}  attrValue="${attrValue}"`, () => {

        const { sut, resources, dom } = setup(
          ctx,
          CustomElementResource.define({ name: 'foobar', bindables }, class FooBar {})
        );

        const instruction = createAttributeInstruction(bindable, attrName, attrValue, false);
        const instructions = instruction === null ? [] : [instruction];
        const childInstructions = !!bindable ? instructions : [];
        const siblingInstructions = !bindable ? instructions : [];

        const [input, output] = createCustomElement(ctx, 'foobar', true, [[attrName, attrValue]], childInstructions, siblingInstructions, []);

        if (attrName.endsWith('.qux')) {
          let e;
          try {
            // @ts-ignore
            sut.compile(dom, input, resources);
          } catch (err) {
            //console.log('EXPECTED: ', JSON.stringify(output.instructions[0][0], null, 2));
            //console.log('ACTUAL: ', JSON.stringify(actual.instructions[0][0], null, 2));
            e = err;
          }
          expect(e).to.be.an('Error');
        } else {
          // enableTracing();
          // Tracer.enableLiveLogging(SymbolTraceWriter);
            // @ts-ignore
          const actual = sut.compile(dom, input, resources);
          // console.log('\n'+stringifyTemplateDefinition(actual, 0));
          // disableTracing();
          try {
            verifyBindingInstructionsEqual(actual, output);
          } catch (err) {
            //console.log('EXPECTED: ', JSON.stringify(output.instructions[0][0], null, 2));
            //console.log('ACTUAL: ', JSON.stringify(actual.instructions[0][0], null, 2));
            throw err;
          }
        }
      });
    });
  });

  describe('custom elements', () => {
    eachCartesianJoinFactory([
      [
        TestContext.createHTMLTestContext
      ],
      [
        (ctx) => createCustomElement(ctx, `foo`, true, [], [], [], []),
        (ctx) => createCustomElement(ctx, `bar`, true, [], [], [], []),
        (ctx) => createCustomElement(ctx, `baz`, true, [], [], [], [])
      ] as ((ctx: HTMLTestContext) => CTCResult)[]
      // <(($1: CTCResult) => CTCResult)[]>[
      //   ([input, output]) => createCustomElement(`foo`, false, [], [], [], output.instructions, output, input),
      //   ([input, output]) => createCustomElement(`bar`, false, [], [], [], output.instructions, output, input),
      //   ([input, output]) => createCustomElement(`baz`, false, [], [], [], output.instructions, output, input)
      // ],
      // <(($1: CTCResult, $2: CTCResult) => CTCResult)[]>[
      //   ($1, [input, output]) => createCustomElement(`foo`, true, [], [], [], output.instructions, output, input),
      //   ($1, [input, output]) => createCustomElement(`bar`, true, [], [], [], output.instructions, output, input),
      //   ($1, [input, output]) => createCustomElement(`baz`, true, [], [], [], output.instructions, output, input)
      // ]
    //], ($1, $2, [input, output]) => {
    ],                       (ctx, [input, output]) => {
      it(`${input.template}`, () => {

        const { sut, resources, dom } = setup(
          ctx,
          CustomElementResource.define({ name: 'foo' }, class Foo {}),
          CustomElementResource.define({ name: 'bar' }, class Bar {}),
          CustomElementResource.define({ name: 'baz' }, class Baz {})
        );

        // enableTracing();
        // Tracer.enableLiveLogging(SymbolTraceWriter);
        const actual = sut.compile(dom, input, resources);
        // console.log('\n'+stringifyTemplateDefinition(actual, 0));
        // disableTracing();
        try {
          verifyBindingInstructionsEqual(actual, output);
        } catch (err) {
          console.log('EXPECTED: ', JSON.stringify(output.instructions, null, 2));
          console.log('ACTUAL: ', JSON.stringify(actual.instructions, null, 2));
          throw err;
        }
      });
    });
  });
});