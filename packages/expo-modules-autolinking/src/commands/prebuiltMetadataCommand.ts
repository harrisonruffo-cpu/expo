import type commander from 'commander';
import fs from 'fs';
import path from 'path';

import { createReactNativeConfigAsync } from '../reactNativeConfig';
import type { RNConfigDependency } from '../reactNativeConfig/reactNativeConfig.types';
import type { AutolinkingCommonArguments } from './autolinkingOptions';
import { createAutolinkingOptionsLoader, registerAutolinkingArguments } from './autolinkingOptions';

interface PrebuiltMetadataArguments extends AutolinkingCommonArguments {
  json?: boolean | null;
}

export interface PrebuiltMetadataEntry {
  type: 'internal' | 'external';
  npmPackage: string;
  packageRoot: string;
  podspecDir: string;
  productName: string;
}

function readJsonFile(filePath: string): any | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`[prebuilt-metadata] Failed to read ${filePath}: ${error}`);
    return null;
  }
}

/** Walks up from `startDir` to the expo monorepo root, mirroring the Ruby scanner. */
function findRepoRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, 'packages', 'expo-modules-core', 'spm.config.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function scanInternalConfigs(repoRoot: string, entries: Record<string, PrebuiltMetadataEntry>) {
  const packagesDir = path.join(repoRoot, 'packages');
  const dirNames = fs
    .readdirSync(packagesDir)
    .filter((name) => !name.startsWith('.'))
    .sort();
  for (const dirName of dirNames) {
    const packageRoot = path.join(packagesDir, dirName);
    const config = readJsonFile(path.join(packageRoot, 'spm.config.json'));
    if (!config) {
      continue;
    }
    const packageJsonPath = path.join(packageRoot, 'package.json');
    const packageJson = readJsonFile(packageJsonPath);
    if (!packageJson && fs.existsSync(packageJsonPath)) {
      // Ruby skips the whole config when package.json is unreadable.
      continue;
    }
    const npmPackage = packageJson?.name || dirName;
    for (const product of config.products ?? []) {
      const podName = product.podName;
      if (podName == null) {
        continue;
      }
      const podspecDir =
        !fs.existsSync(path.join(packageRoot, 'ios', `${podName}.podspec`)) &&
        fs.existsSync(path.join(packageRoot, `${podName}.podspec`))
          ? packageRoot
          : path.join(packageRoot, 'ios');
      entries[podName] = {
        type: 'internal',
        npmPackage,
        packageRoot,
        podspecDir,
        productName: product.name || podName,
      };
    }
  }
}

function scanExternalConfigs(
  dependencies: Record<string, RNConfigDependency>,
  entries: Record<string, PrebuiltMetadataEntry>
) {
  const externalConfigsDir = path.join(__dirname, '..', '..', 'external-configs', 'ios');
  const configPaths = [
    ...globConfigs(externalConfigsDir, false),
    ...globConfigs(externalConfigsDir, true),
  ];
  for (const [npmPackage, configPath] of configPaths) {
    const packageRoot = dependencies[npmPackage]?.root;
    if (!packageRoot) {
      continue;
    }
    const config = readJsonFile(configPath);
    for (const product of config?.products ?? []) {
      const podName = product.podName;
      if (podName == null) {
        continue;
      }
      entries[podName] = {
        type: 'external',
        npmPackage,
        packageRoot,
        podspecDir: packageRoot,
        productName: product.name || podName,
      };
    }
  }
}

function globConfigs(externalConfigsDir: string, scoped: boolean): [string, string][] {
  const results: [string, string][] = [];
  let dirs: string[] = [];
  try {
    dirs = fs
      .readdirSync(externalConfigsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('@') === scoped)
      .map((entry) => entry.name);
  } catch {
    return results;
  }
  for (const dir of dirs) {
    const candidates = scoped
      ? fs.readdirSync(path.join(externalConfigsDir, dir)).map((sub) => `${dir}/${sub}`)
      : [dir];
    for (const npmPackage of candidates) {
      const configPath = path.join(externalConfigsDir, npmPackage, 'spm.config.json');
      if (fs.existsSync(configPath)) {
        results.push([npmPackage, configPath]);
      }
    }
  }
  return results;
}

/** Emits the prebuilt-modules metadata document (ENG-25370): the identity join
 * between npm packages, pods, and products, for internal and external products. */
export function prebuiltMetadataCommand(cli: commander.CommanderStatic) {
  return registerAutolinkingArguments(cli.command('prebuilt-metadata [searchPaths...]'))
    .option('-j, --json', 'Output results in the plain JSON format.', () => true, false)
    .action(async (searchPaths: string[] | null, commandArguments: PrebuiltMetadataArguments) => {
      const autolinkingOptionsLoader = createAutolinkingOptionsLoader({
        ...commandArguments,
        searchPaths,
      });
      const appRoot = await autolinkingOptionsLoader.getAppRoot();
      const repoRoot = findRepoRoot(process.cwd());
      if (!repoRoot) {
        throw new Error(
          'prebuilt-metadata currently supports only the expo monorepo. Standalone project support arrives with a later ENG-25370 phase.'
        );
      }

      const entries: Record<string, PrebuiltMetadataEntry> = {};
      scanInternalConfigs(repoRoot, entries);

      const reactNativeConfig = await createReactNativeConfigAsync({
        autolinkingOptions: await autolinkingOptionsLoader.getPlatformOptions('ios'),
        appRoot,
        sourceDir: undefined,
      });
      scanExternalConfigs(reactNativeConfig.dependencies ?? {}, entries);

      const sorted = Object.fromEntries(
        Object.keys(entries)
          .sort()
          .map((podName) => [podName, entries[podName]])
      );
      if (commandArguments.json) {
        console.log(JSON.stringify(sorted));
      } else {
        console.log(require('util').inspect(sorted, false, null, true));
      }
    });
}
