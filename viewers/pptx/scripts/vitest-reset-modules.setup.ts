// Runs before each test file on a shared worker: drop the module registry so a file that mocks a
// module imports a fresh graph instead of one an earlier file in the worker already evaluated.
import { vi } from 'vitest';

vi.resetModules();
