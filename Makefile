-include .env

.PHONY: install
install:
	@pnpm install

.PHONY: dev
dev: install
	@pnpm dev

.PHONY: build
build: install
	@pnpm build

.PHONY: lint
lint: install
	@echo "Running oxlint with fix..."
	@pnpm oxlint --fix

.PHONY: lint-check
lint-check: install
	@echo "Running oxlint..."
	@pnpm oxlint

.PHONY: format
format: install
	@echo "Running prettier formatter..."
	@pnpm prettier --write .

.PHONY: format-check
format-check: install
	@echo "Running prettier formatter check..."
	@pnpm prettier --check .

.PHONY: tc
tc: install
	@echo "\nRunning tsc..."
	@pnpm tsc -b
	@echo "\n tsc ok"

.PHONY: test
test: install
	@echo "\nRunning vitest..."
	@pnpm test

.PHONY: qa-check
qa-check: install
	@echo "\nRunning oxlint..."
	@pnpm oxlint
	@echo "\nRunning prettier.."
	@pnpm prettier --check .
	@echo "\nRunning tsc..."
	@pnpm tsc -b
	@echo "\nRunning vitest..."
	@pnpm test
	@echo "\nQA check complete"
