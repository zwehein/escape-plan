# Deploy Escape Plan to AWS EC2

This guide runs the game and its web client on one Ubuntu EC2 instance. Nginx
serves HTTP on port 80 and forwards Socket.IO (including WebSocket upgrades) to
Node.js on localhost:3000. The admin page stays off the public web listener; use
an SSH tunnel to open it. The process starts at boot and restarts if it exits.

## AWS resources and network rules

AWS Free Tier eligibility depends on the account's age, plan and current usage.
Before launching, check the EC2 launch page's free-tier label and the billing
console. AWS free usage is limited and charges can apply after limits are
reached.

In the AWS console, create a VPC with one public subnet in one Availability
Zone, one Internet Gateway, and no NAT Gateway or VPC endpoints. A NAT Gateway
adds hourly and data charges and is unnecessary for this single public server.
Use a public IPv4 address for the instance and ensure the subnet route table
has `0.0.0.0/0` routed to the Internet Gateway. The VPC CIDR and subnet CIDR
are private address ranges used inside AWS; the public IP is how players reach
the instance from the internet.

Create a security group with these inbound rules:

| Protocol | Port | Source | Purpose |
| --- | ---: | --- | --- |
| TCP | 80 | `0.0.0.0/0` | Public game page, HTTP and Socket.IO |
| TCP | 22 | Your current public IP `/32` | SSH administration only |

Do not add port 3000 to the security group. Node listens only on localhost;
Nginx proxies player traffic internally. SSH is TCP port 22 and should not be
open to `0.0.0.0/0`. If you enable IPv6 for the subnet, add corresponding IPv6
web rules intentionally; otherwise IPv4 is enough.

Launch one Ubuntu Server 24.04 LTS instance in that public subnet. Choose an
instance size marked free-tier eligible for your account (for example, where
eligible, `t3.micro`), an 8 GiB `gp3` boot volume, and a new SSH key pair. Keep
the private key secure. Do not allocate an Elastic IP unless you have checked
its current charges. A regular public IPv4 address can change after the
instance is stopped and started.

## Install the application

Connect using the instance's public IPv4 address and the downloaded key:

```sh
ssh -i escape-plan.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

Install Node.js 22, Nginx, and Git, then create a dedicated service account:

```sh
sudo apt update
sudo apt install -y ca-certificates curl git nginx
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version
sudo useradd --system --user-group --home-dir /opt/escape-plan --no-create-home --shell /usr/sbin/nologin escapeplan
sudo git clone https://github.com/BaroqueViola/escape-plan.git /opt/escape-plan
sudo chown -R escapeplan:escapeplan /opt/escape-plan
sudo -u escapeplan npm ci --prefix /opt/escape-plan
```

Create the service environment file. Use a unique, long random password (not
`admin123`). The admin page will refuse to start in production with the default
password. Leave the voice key empty if you do not use ElevenLabs.

```sh
sudo install -o root -g escapeplan -m 640 /dev/null /etc/escape-plan.env
sudo nano /etc/escape-plan.env
```

Put this in the file, replacing the password and optionally setting the API
key:

```ini
ADMIN_PASSWORD=replace-with-a-long-random-password
ELEVENLABS_API_KEY=
VOICE_DAILY_CREDITS=300
VOICE_MONTHLY_CREDITS=9000
```

Copy the included service and Nginx configuration into place, then start both
services:

```sh
sudo cp /opt/escape-plan/ops/ec2/escape-plan.service /etc/systemd/system/escape-plan.service
sudo cp /opt/escape-plan/ops/ec2/nginx.conf /etc/nginx/sites-available/escape-plan
sudo ln -s /etc/nginx/sites-available/escape-plan /etc/nginx/sites-enabled/escape-plan
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl daemon-reload
sudo systemctl enable --now escape-plan
```

The first start builds the game client and engine before launching the server.
Allow a minute or two, then visit `http://YOUR_EC2_PUBLIC_IP/`. Players can
join from separate devices by opening that same address. This basic setup uses
HTTP; the admin password is entered through an SSH tunnel, not through the
public HTTP page. For a public production site, add a domain and HTTPS before
collecting user credentials or private information.

## Admin page and service operations

From your own computer, open an SSH tunnel:

```sh
ssh -i escape-plan.pem -L 3000:127.0.0.1:3000 ubuntu@YOUR_EC2_PUBLIC_IP
```

Keep that terminal open and visit `http://localhost:3000/admin.html`. Enter
the `ADMIN_PASSWORD` from `/etc/escape-plan.env`. The tunnel carries both the
admin page and its Socket.IO connection through SSH. Port 3000 remains closed
to the public internet.

Useful commands on the instance:

```sh
sudo systemctl status escape-plan
sudo journalctl -u escape-plan -f
sudo systemctl restart escape-plan
```

To update after pushing changes to `main`:

```sh
cd /opt/escape-plan
sudo -u escapeplan git pull --ff-only
sudo -u escapeplan npm ci
sudo systemctl restart escape-plan
```

The game state and scores live in memory, so a restart clears the current game.
The voice clip cache persists on the instance disk. Check AWS billing and EC2
free-tier usage regularly; stopping or terminating the instance does not
necessarily remove every separately billed resource.
