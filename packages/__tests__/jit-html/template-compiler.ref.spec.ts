import {
  Constructable, PLATFORM, RuntimeCompilationResources
} from '@aurelia/kernel';
import {
  Aurelia,
  BindingMode,
  ComponentHost,
  Controller,
  CustomAttribute,
  CustomElement,
  CustomElementHost,
  IController,
  INode,
  IRenderLocation,
  ITemplateCompiler,
  IViewFactory,
  LifecycleFlags
} from '@aurelia/runtime';
import {
  assert,
  HTMLTestContext,
  TestContext
} from '@aurelia/testing';

describe.only('templating-compiler.ref.spec.ts', function() {

  before(async function() {
    await waitForFrames(2);
  });
  after(async function() {
    await waitForFrames(2);
  });

  interface IRefIntegrationTestCase {
    title: string;
    template: string | HTMLElement;
    root?: Constructable;
    only?: boolean;
    resources?: any[];
    browserOnly?: boolean;
    testWillThrow?: boolean;
    assertFn(ctx: HTMLTestContext, host: HTMLElement, comp: any): void | Promise<void>;
    assertFn_AfterDestroy?(ctx: HTMLTestContext, host: HTMLElement, comp: any): void | Promise<void>;
  }

  const testCases: IRefIntegrationTestCase[] = [
    {
      title: 'basic ref usage without any target',
      template:
        `<div ref=hello>`,
      assertFn: (ctx, host, comp) => {
        assert.notEqual(comp.hello, undefined);
        assert.strictEqual(host.querySelector('div'), comp.hello);
      },
      assertFn_AfterDestroy: (ctx, host, comp) => {
        assert.equal(comp.hello, null);
      }
    },
    {
      title: 'basic ref usage with [element.ref]',
      template:
        `<div element.ref=hello>`,
      assertFn: (ctx, host, comp) => {
        assert.notEqual(comp.hello, undefined);
        assert.strictEqual(host.querySelector('div'), comp.hello);
      },
      assertFn_AfterDestroy: (ctx, host, comp) => {
        assert.equal(comp.hello, null);
      }
    },
    {
      title: 'basic ref usage with [ref.element]',
      template:
        `<div ref.element=hello>`,
      assertFn: (ctx, host, comp) => {
        assert.notEqual(comp.hello, undefined);
        assert.strictEqual(host.querySelector('div'), comp.hello);
      },
      assertFn_AfterDestroy: (ctx, host, comp) => {
        assert.equal(comp.hello, null);
      }
    },
    {
      title: 'basic ref usage within [REPEAT] template controller, ref BEFORE template controller',
      template: `<div repeat.for="i of 10" ref=hello>`,
      root: class App {
        // to assert scope assignment of ref
        public hello = undefined;
      },
      assertFn: (ctx, host, comp) => {
        assert.notEqual(comp.hello, undefined);
        assert.equal(host.querySelectorAll('div').length, 10);
        assert.strictEqual(comp.hello, host.querySelectorAll('div')[9]);
      }
    },
    {
      title: 'basic ref usage within [REPEAT] template controller, ref AFTER template controller',
      template: `<div repeat.for="i of 10" ref=hello>`,
      root: class App {
        // to assert scope assignment of ref
        public hello = undefined;
      },
      assertFn: (ctx, host, comp) => {
        assert.notEqual(comp.hello, undefined);
        assert.equal(host.querySelectorAll('div').length, 10);
        assert.strictEqual(comp.hello, host.querySelectorAll('div')[9]);
      }
    },
    {
      title: 'basic ref usage with a custom element view model [view-model.ref]',
      template: `<c-e view-model.ref=ce>`,
      resources: [
        CustomElement.define({ name: 'c-e' })
      ],
      assertFn: (ctx, host, comp) => {
        assert.notEqual(comp.ce, undefined);
        assert.equal(comp.ce.$controller instanceof Controller, true);
      }
    },
    {
      title: 'basic ref usage with a custom element view model [ref.view-model]',
      template: `<c-e ref.view-model=ce>`,
      resources: [
        CustomElement.define({ name: 'c-e' })
      ],
      assertFn: (ctx, host, comp) => {
        assert.notEqual(comp.ce, undefined);
        assert.equal(comp.ce.$controller instanceof Controller, true);
      }
    },
    // {
    //   title: 'basic ref usage with custom attribute view model'
    // },
    ...Array.from({ length: 10 }).flatMap((_, idx, arr) => {
      const Attrs = Array.from({ length: arr.length }).map((__, idx1) => CustomAttribute.define(
        { name: `c-a-${idx1}` },
        class Ca {}
      ));
      const attrString = Array.from({ length: arr.length }, (__, idx1) => `c-a-${idx1}="a"`).join(' ');
      const attr_RefString = Array.from({ length: arr.length }, (__, idx1) => `c-a-${idx1}.ref="ca${idx1}"`).join(' ');
      const ref_Attr_String = Array.from({ length: arr.length }, (__, idx1) => `ref.c-a-${idx1}="ca${idx1}"`).join(' ');
      return [
        {
          title: 'ref usage with multiple custom attributes on a normal element, syntax: [xxx.ref]',
          template: `<div ${attrString} ${attr_RefString}>`,
          resources: Attrs,
          assertFn: (ctx, host, comp) => {
            const div = host.querySelector('div') as ComponentHost;
            for (let i = 0, ii = arr.length; ii > i; ++i) {
              assert.strictEqual(div.$au[`c-a-${i}`].viewModel, comp[`ca${i}`]);
            }
          }
        },
        {
          title: 'ref usage with multiple custom attribute on a normal element, syntax: [ref.xxx]',
          template: `<div ${attrString} ${ref_Attr_String}>`,
          resources: Attrs,
          assertFn: (ctx, host, comp) => {
            const div = host.querySelector('div') as ComponentHost;
            for (let i = 0, ii = arr.length; ii > i; ++i) {
              assert.strictEqual(div.$au[`c-a-${i}`].viewModel, comp[`ca${i}`]);
            }
          }
        },
        // {
        //   title: 'ref usage with multiple custom attributes on a normal element, syntax: [xxx.ref], ref before attr declaration',
        //   template: `<div ${attr_RefString} ${attrString}>`,
        //   resources: Attrs,
        //   assertFn: (ctx, host, comp) => {
        //     const div = host.querySelector('div') as ComponentHost;
        //     for (let i = 0, ii = arr.length; ii > i; ++i) {
        //       assert.strictEqual(div.$au[`c-a-${i}`].viewModel, comp[`ca${i}`]);
        //     }
        //   }
        // },
        // {
        //   title: 'ref usage with multiple custom attributes on a normal element, syntax: [ref.xxx], ref before attr declaration',
        //   template: `<div ${ref_Attr_String} ${attrString}>`,
        //   resources: Attrs,
        //   assertFn: (ctx, host, comp) => {
        //     const div = host.querySelector('div') as ComponentHost;
        //     for (let i = 0, ii = arr.length; ii > i; ++i) {
        //       assert.strictEqual(div.$au[`c-a-${i}`].viewModel, comp[`ca${i}`]);
        //     }
        //   }
        // }
      ] as IRefIntegrationTestCase[];
    }),
    // before are non-happy-path scenarios
    // just to complete the assertion
    ...[
      'view',
      'controller',
      'view-model',
      'rando'
    ].flatMap(refTarget => {
      return [
        {
          title: `basic WRONG ref usage with [${refTarget}.ref]`,
          testWillThrow: true,
          template: `<div ${refTarget}.ref=hello>`
        },
        {
          title: `basic WRONG ref usage with [ref.${refTarget}]`,
          testWillThrow: true,
          template: `<div ref.${refTarget}=hello>`
        },
      ] as IRefIntegrationTestCase[];
    }),
    {
      title: `basic WRONG ref usage with [repeat.ref] as cannot reference template controller`,
      testWillThrow: true,
      template: `<div repeat.for="i of 1" repeat.ref=hello>`,
      assertFn: PLATFORM.noop
    },
    {
      title: `basic WRONG ref usage with [ref.repeat] as cannot reference template controller`,
      testWillThrow: true,
      template: `<div repeat.for="i of 1" ref.repeat=hello>`,
      assertFn: PLATFORM.noop
    },
  ];

  for (const testCase of testCases) {
    const {
      title,
      template,
      root,
      resources = [],
      assertFn,
      assertFn_AfterDestroy = PLATFORM.noop,
      testWillThrow
    } = testCase;
    it(title, async function() {
      let body: HTMLElement;
      let host: HTMLElement;
      try {
        const ctx = TestContext.createHTMLTestContext();

        const App = CustomElement.define({ name: 'app', template }, root);
        const component = new App();
        const au = new Aurelia(ctx.container);

        body = ctx.doc.body;
        host = body.appendChild(ctx.createElement('app'));
        ctx.container.register(...resources);

        let didThrow = false;
        try {
          au.app({ host, component });
          await au.start().wait();
        } catch (ex) {
          didThrow = true;
          if (testWillThrow) {
            // dont try to assert anything on throw
            // just bails
            try {
              await au.stop().wait();
            } catch {/* and ignore all errors trying to stop */}
            return;
          }
          throw ex;
        }

        if (testWillThrow && !didThrow) {
          throw new Error('Expected test to throw, but did NOT');
        }

        await assertFn(ctx, host, component);

        await au.stop().wait();
        await assertFn_AfterDestroy(ctx, host, component);
      } finally {
        if (host) {
          host.remove();
        }
        if (body) {
          body.focus();
        }
        await waitForFrames(2);
      }
    });
  }
});

async function waitForFrames(frameCount: number): Promise<void> {
  while (frameCount-- > 0) {
    await new Promise(PLATFORM.requestAnimationFrame);
  }
}
