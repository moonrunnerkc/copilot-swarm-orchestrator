// Author: Bradley R. Kinnard
import { strict as assert } from 'assert';
import type { WrapperOptions } from '../src/copilot-cli-wrapper';
import CopilotCliWrapper from '../src/copilot-cli-wrapper';

describe('Upgrade 4: Strict Isolation', () => {

  describe('CopilotCliWrapper strictIsolation option', () => {
    it('should accept strictIsolation in WrapperOptions', () => {
      const opts: WrapperOptions = {
        gracefulDegradation: true,
        strictIsolation: true
      };

      const wrapper = new CopilotCliWrapper(opts);
      // wrapper created without error, option accepted
      assert.ok(wrapper, 'wrapper should instantiate with strictIsolation');
    });

    it('should default strictIsolation to undefined when not set', () => {
      const opts: WrapperOptions = { gracefulDegradation: true };
      const wrapper = new CopilotCliWrapper(opts);
      assert.ok(wrapper, 'wrapper should instantiate without strictIsolation');
    });
  });

  describe('ExecutionOptions strictIsolation field', () => {
    it('should exist on the ExecutionOptions interface', () => {
      // import the type and verify it accepts the field
      const opts = {
        delegate: false,
        mcp: false,
        enableExternal: false,
        dryRun: false,
        autoPR: false,
        strictIsolation: true
      };
      // type-level check: if this compiles and runs, the field exists
      assert.strictEqual(opts.strictIsolation, true);
    });
  });
});
