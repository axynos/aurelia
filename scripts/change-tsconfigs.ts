import { File } from './files';
import { c, createLogger } from './logger';
import project from './project';

(async function () {
  const log = createLogger('change-tsconfigs');

  const [, , operation, mod] = process.argv;

  const packages = project.packages;
  const tsconfigFiles = packages.map(pkg => new File(pkg.tsconfig));

  for (const file of tsconfigFiles) {
    const backupPath = file.path.replace('.json', '.json.bak');

    switch (operation) {
      case 'overwrite': {
        await file.readContent();
        await file.saveAs(backupPath);

        log(`backing up tsconfig: ${backupPath}`);

        const json = JSON.parse(file.content.toString('utf8'));
        json.compilerOptions.outDir = `dist/${mod}`;
        json.compilerOptions.module = mod;

        log(`overwriting tsconfig: ${file.path}`);

        await file.overwrite(Buffer.from(JSON.stringify(json, null, 2)));

        break;
      }
      case 'restore': {
        log(`restoring tsconfig: ${file.path} from backup: ${backupPath} and removing backup`);

        await file.restore(backupPath);

        break;
      }
    }
  }

})();
