#!/bin/sh
# Run the Fly.io CLI (fly / flyctl). Not available via npm — install once:
#   brew install flyctl
#   curl -L https://fly.io/install.sh | sh

set -e

if command -v fly >/dev/null 2>&1; then
  exec fly "$@"
fi

if command -v flyctl >/dev/null 2>&1; then
  exec flyctl "$@"
fi

if [ -x "$HOME/.fly/bin/fly" ]; then
  exec "$HOME/.fly/bin/fly" "$@"
fi

if [ -x "$HOME/.fly/bin/flyctl" ]; then
  exec "$HOME/.fly/bin/flyctl" "$@"
fi

echo "Fly CLI not found."
echo ""
echo "Install it once, then re-run the npm script:"
echo "  brew install flyctl"
echo "  # or"
echo "  curl -L https://fly.io/install.sh | sh"
echo ""
echo "After the curl install, add ~/.fly/bin to your PATH or open a new terminal."
exit 1
