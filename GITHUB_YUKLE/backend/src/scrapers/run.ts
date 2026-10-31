import { runAllScrapers } from './index';

const only = process.argv.slice(2);
runAllScrapers(only.length ? only : undefined)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
