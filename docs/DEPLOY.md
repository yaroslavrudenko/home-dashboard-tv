# Deploying Home Dashboard to a Samsung TV

Samsung TVs install only apps signed with **your own Samsung certificate, tied to the TV's ID (DUID)**, and
only after the **device profile** Samsung issues with that certificate is on the TV. This guide covers
both. It comes from putting the author's previous Tizen app on a 2017 UE50MU7000 (Tizen 3.0) from a Mac.
The same certificates and device profile work for every app you build for that TV: a new package id
needs no new certificate.

## 1. Developer Mode on the TV

1. On the TV open **Apps**, then type `1 2 3 4 5` on the remote.
2. Turn **Developer mode** on and enter your **computer's IP address**.
3. Restart the TV (hold Power until it reboots).

```sh
curl -s http://<tv-ip>:8001/api/v2/ | grep -o '"developerMode":"[01]","developerIP":"[^"]*"'
nc -z <tv-ip> 26101 && echo "sdb port open"
```

## 2. Tizen CLI

Install `web-cli_Tizen_SDK_<version>_<os>.bin` from the Tizen site (it goes to `~/tizen-studio`).

- **Apple Silicon:** the bundled Java is Intel-only; install Rosetta first:
  `softwareupdate --install-rosetta --agree-to-license`.
- **Package repository:** the default URL returns 403. Switch it, then install the Samsung certificate tools:

```sh
sed -i '' 's#http://usa.sdk-dl.tizen.org/sdk/tizenstudio#https://download.tizen.org/sdk/tizenstudio#' ~/tizen-studio/.info/repository.info
~/tizen-studio/package-manager/package-manager-cli.bin install --accept-license Certificate-Manager,cert-add-on
```

## 3. Connect `sdb`

```sh
~/tizen-studio/tools/sdb connect <tv-ip>:26101
~/tizen-studio/tools/sdb devices
```

On macOS, programs started from `tmux` or by an automation tool may get "No route to host" (Local
Network privacy) even though `ping` works. Run `sdb kill-server; sdb connect <tv-ip>:26101` once from a
normal Terminal window and allow local-network access; the background `sdb` server then serves every shell.

**The TV's address can change** after a restart (the router assigns it). `tools/find-tv.sh <ip:port>`
tries the given address and otherwise scans the Mac's /24 network for port 26101; `./build.sh` calls it
on its own. Developer Mode is bound to the Mac's address, so it survives the TV moving.

## 4. Samsung certificates

You need an **author** certificate and a **distributor** certificate whose request carries the TV's DUID
(`sdb shell 0 getduid`). The official Certificate Manager GUI does not draw its window on recent macOS. It
can be bypassed by calling Samsung's certificate service directly, the same calls the GUI makes. A
one-command script that does this is in the author's earlier project (`tools/samsung-cert.mjs` in
kinozal-anastasia). The outcome you need is:

- a Tizen **security profile** registered with the CLI (`tizen security-profiles list` shows it), holding
  `author.p12` and `distributor.p12` built with `openssl pkcs12 -export -legacy` (the TV cannot read newer PKCS#12);
- the **`device-profile.xml`** returned by the v1 distributor endpoint.

Keep the keystore folder private: it holds your private keys. Certificates last two years.

## 5. The device profile: the step most guides miss

With valid certificates, an install still fails with a bare `install failed[118]` until the device
profile is on the TV (Tizen Studio calls this "Permit to install applications"). `build.sh` pushes it
before every install:

```sh
STAGE=/home/owner/share/tmp/sdk_tools
sdb -s <tv> push device-profile.xml $STAGE/device-profile.xml
sdb -s <tv> push HomeDashboard.wgt  $STAGE/package.wgt
sdb -s <tv> shell 0 vd_appinstall HomeDash01.Dashboard $STAGE/package.wgt
sdb -s <tv> shell 0 was_execute   HomeDash01.Dashboard
```

## 6. Build, sign, install

```sh
cp build.local.env.example build.local.env
# CERT_PROFILE=<security profile name>
# DEVICE_PROFILE=<path to device-profile.xml>
# TV=<tv-ip>:26101
./build.sh --package     # build + sign only: .buildResult/HomeDashboard.wgt, no TV needed
./build.sh               # build + sign + push device profile + install + launch
```

The app appears in the TV's Apps list as **Home Dashboard** (package `HomeDash01`, app id
`HomeDash01.Dashboard`).
