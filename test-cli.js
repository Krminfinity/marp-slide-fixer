#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('slide-fixer')
  .description('Test CLI')
  .version('1.0.0')
  .requiredOption('--in <input>', 'Input file')
  .requiredOption('--out <output>', 'Output file');

console.log('Starting CLI...');
program.parse();
console.log('CLI parsed successfully');

const options = program.opts();
console.log('Options:', options);
