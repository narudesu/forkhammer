import chalk from "chalk";

globalThis.logDebug = (...args) => {
  console.log(
    ...args.map((arg, i) => {
      if (typeof arg === "string") {
        if (i === 0) {
          return "🪵🐛 : " + chalk.bgBlack(chalk.ansi256(46)(arg));
        }
        return chalk.gray(arg);
      }

      return arg;
    }),
  );
};
