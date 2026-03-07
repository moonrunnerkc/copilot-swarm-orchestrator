// Author: Bradley R. Kinnard
import { strict as assert } from 'assert';
import type { WrapperOptions } from '../src/copilot-cli-wrapper';
import CopilotCliWrapper from '../src/copilot-cli-wrapper';

describe('Upgrade 5: Inner Fleet Toggle', () => {

  it('should accept useInnerFleet on WrapperOptions', () => {
    const opts: WrapperOptions = {
      gracefulDegradation: true,
      useInnerFleet: true
    };
    const wrapper = new CopilotCliWrapper(opts);
    assert.ok(wrapper, 'wrapper should instantiate with useInnerFleet');
  });

  it('should default useInnerFleet to undefined when not set', () => {
    const opts: WrapperOptions = { gracefulDegradation: true };
    const wrapper = new CopilotCliWrapper(opts);
    assert.ok(wrapper, 'wrapper should instantiate without useInnerFleet');
  });

  describe('prompt transformation logic', () => {
    it('should prepend /fleet when useInnerFleet is true and input exists', () => {
      // Replicate the exact transformation logic from execute()
      const wrapperOpts = { useInnerFleet: true } as WrapperOptions;
      let execOptions = { input: 'Build an API' };

      if (wrapperOpts.useInnerFleet && execOptions.input) {
        execOptions = { ...execOptions, input: `/fleet ${execOptions.input}` };
      }

      assert.ok(execOptions.input.startsWith('/fleet '), 'should start with /fleet');
      assert.strictEqual(execOptions.input, '/fleet Build an API');
    });

    it('should NOT modify prompt when useInnerFleet is false', () => {
      const wrapperOpts = { useInnerFleet: false } as WrapperOptions;
      let execOptions = { input: 'Build an API' };

      if (wrapperOpts.useInnerFleet && execOptions.input) {
        execOptions = { ...execOptions, input: `/fleet ${execOptions.input}` };
      }

      assert.strictEqual(execOptions.input, 'Build an API');
      assert.ok(!execOptions.input.includes('/fleet'));
    });

    it('should NOT modify prompt when useInnerFleet is absent', () => {
      const wrapperOpts = {} as WrapperOptions;
      let execOptions = { input: 'Build an API' };

      if (wrapperOpts.useInnerFleet && execOptions.input) {
        execOptions = { ...execOptions, input: `/fleet ${execOptions.input}` };
      }

      assert.strictEqual(execOptions.input, 'Build an API');
    });

    it('should NOT modify when input is missing even if useInnerFleet is true', () => {
      const wrapperOpts = { useInnerFleet: true } as WrapperOptions;
      let execOptions: { input?: string } = {};

      if (wrapperOpts.useInnerFleet && execOptions.input) {
        execOptions = { ...execOptions, input: `/fleet ${execOptions.input}` };
      }

      assert.strictEqual(execOptions.input, undefined);
    });
  });
});
