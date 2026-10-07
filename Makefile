.DEFAULT_GOAL := autopilot-help
.PHONY: autopilot-help autopilot-status autopilot-on autopilot-off autopilot-run autopilot-config autopilot-apply autopilot-check autopilot-logs
autopilot-help:
	@python3 scripts/autopilot.py help
autopilot-status:
	@python3 scripts/autopilot.py status
autopilot-on:
	@python3 scripts/autopilot.py on
autopilot-off:
	@python3 scripts/autopilot.py off
autopilot-run:
	@python3 scripts/autopilot.py run
autopilot-config:
	@python3 scripts/autopilot.py config
autopilot-apply:
	@python3 scripts/autopilot.py apply
autopilot-check:
	@python3 scripts/autopilot.py check
autopilot-logs:
	@python3 scripts/autopilot.py logs
