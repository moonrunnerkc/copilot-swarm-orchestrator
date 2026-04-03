import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadRecipe, listRecipes, listRecipeDetails, parameterizeRecipe, Recipe } from '../src/recipe-loader';

describe('RecipeLoader', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-loader-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('listRecipes', () => {
    it('should return an array of recipe names', () => {
      const recipes = listRecipes();
      assert.ok(Array.isArray(recipes));
      // Names should not include .json extension
      for (const name of recipes) {
        assert.ok(!name.endsWith('.json'), `recipe name "${name}" should not end with .json`);
      }
    });

    it('should return sorted names', () => {
      const recipes = listRecipes();
      const sorted = [...recipes].sort();
      assert.deepStrictEqual(recipes, sorted);
    });
  });

  describe('loadRecipe', () => {
    it('should throw with available recipes for unknown name', () => {
      assert.throws(
        () => loadRecipe('nonexistent-recipe-xyz'),
        (err: Error) => {
          assert.ok(err.message.includes('Unknown recipe "nonexistent-recipe-xyz"'));
          assert.ok(err.message.includes('Available recipes:'));
          return true;
        }
      );
    });

    it('should load a recipe with required fields', () => {
      const names = listRecipes();
      if (names.length === 0) return; // skip if no recipes exist
      const recipe = loadRecipe(names[0]);
      assert.ok(recipe.name, 'recipe should have a name');
      assert.ok(recipe.description, 'recipe should have a description');
      assert.ok(recipe.category, 'recipe should have a category');
      assert.ok(Array.isArray(recipe.steps), 'recipe should have a steps array');
      assert.ok(recipe.steps.length > 0, 'recipe should have at least one step');
    });
  });

  describe('listRecipeDetails', () => {
    it('should return full recipe objects for every available recipe', () => {
      const details = listRecipeDetails();
      const names = listRecipes();
      assert.strictEqual(details.length, names.length);
      for (const recipe of details) {
        assert.ok(recipe.name);
        assert.ok(recipe.steps);
      }
    });
  });

  describe('parameterizeRecipe', () => {
    const baseRecipe: Recipe = {
      name: 'test-recipe',
      description: 'A test recipe',
      category: 'testing',
      parameters: {
        framework: { description: 'Test framework', default: 'mocha' },
        language: { description: 'Programming language' },
      },
      steps: [
        {
          stepNumber: 1,
          agentName: 'backend_master',
          task: 'Set up {{framework}} tests for {{language}} project',
          dependencies: [],
          expectedOutputs: ['test/'],
        },
        {
          stepNumber: 2,
          agentName: 'tester_elite',
          task: 'Write unit tests using {{framework}}',
          dependencies: [1],
          expectedOutputs: ['test/unit/'],
        },
      ],
    };

    it('should substitute parameters into step tasks', () => {
      const plan = parameterizeRecipe(baseRecipe, { framework: 'jest', language: 'typescript' });
      assert.strictEqual(plan.steps[0].task, 'Set up jest tests for typescript project');
      assert.strictEqual(plan.steps[1].task, 'Write unit tests using jest');
    });

    it('should use defaults when parameter not provided', () => {
      const plan = parameterizeRecipe(baseRecipe, { language: 'python' });
      assert.strictEqual(plan.steps[0].task, 'Set up mocha tests for python project');
    });

    it('should throw when a required parameter has no value and no default', () => {
      assert.throws(
        () => parameterizeRecipe(baseRecipe, {}),
        (err: Error) => {
          assert.ok(err.message.includes('parameter "language"'));
          assert.ok(err.message.includes('no value and no default'));
          return true;
        }
      );
    });

    it('should produce a valid ExecutionPlan', () => {
      const plan = parameterizeRecipe(baseRecipe, { language: 'go' });
      assert.ok(plan.goal.includes('test-recipe'));
      assert.ok(plan.createdAt);
      assert.strictEqual(plan.steps.length, 2);
      assert.strictEqual(plan.metadata?.totalSteps, 2);
    });

    it('should not mutate the original recipe dependencies', () => {
      const plan = parameterizeRecipe(baseRecipe, { language: 'rust' });
      plan.steps[1].dependencies.push(99);
      assert.deepStrictEqual(baseRecipe.steps[1].dependencies, [1]);
    });

    it('should handle recipe with no parameters and no placeholders', () => {
      const simpleRecipe: Recipe = {
        name: 'simple',
        description: 'No params',
        category: 'misc',
        parameters: {},
        steps: [{
          stepNumber: 1,
          agentName: 'backend_master',
          task: 'Do a fixed task',
          dependencies: [],
          expectedOutputs: ['output.txt'],
        }],
      };
      const plan = parameterizeRecipe(simpleRecipe, {});
      assert.strictEqual(plan.steps[0].task, 'Do a fixed task');
    });
  });
});
