set dotenv-load := false

_default:
  @just --list

setup:
  corepack enable
  pnpm install --frozen-lockfile

build:
  pnpm build

dev *args:
  pnpm dev {{args}}

run *args:
  pnpm --filter @olympus/cli dev {{args}}

test:
  pnpm test

eval:
  pnpm eval

check:
  pnpm check

format:
  pnpm format

clean:
  pnpm clean
