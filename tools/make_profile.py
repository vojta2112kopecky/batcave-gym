#!/usr/bin/env python3
"""
Vyrobí konfigurační profil pro iPhone (Web Clip).
Otevřeš ho na telefonu, nainstaluješ – a na ploše je ikona appky,
která se otevírá na celou obrazovku bez Safari. Zdarma, bez Xcode,
bez Apple ID a nic nevyprší.

    python3 tools/make_profile.py
"""
import base64
import os
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://vojta2112kopecky.github.io/batcave-gym/"
OUT = os.path.join(ROOT, "BatcaveGym.mobileconfig")

icon = base64.b64encode(open(os.path.join(ROOT, "icon-180.png"), "rb").read()).decode()
# rozlámat na řádky, ať je profil čitelný
icon = "\n".join(icon[i:i + 76] for i in range(0, len(icon), 76))

# stabilní identifikátory – při přeinstalaci se profil nahradí, nezaloží druhý
PROFILE_UUID = str(uuid.uuid5(uuid.NAMESPACE_URL, URL + "#profile")).upper()
CLIP_UUID = str(uuid.uuid5(uuid.NAMESPACE_URL, URL + "#clip")).upper()

xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>PayloadType</key>
			<string>com.apple.webClip.managed</string>
			<key>PayloadIdentifier</key>
			<string>cz.vojtakopecky.batcavegym.webclip</string>
			<key>PayloadUUID</key>
			<string>{CLIP_UUID}</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
			<key>PayloadDisplayName</key>
			<string>Batcave Gym</string>
			<key>URL</key>
			<string>{URL}</string>
			<key>Label</key>
			<string>Batcave Gym</string>
			<key>Icon</key>
			<data>
{icon}
			</data>
			<key>IsRemovable</key>
			<true/>
			<key>FullScreen</key>
			<true/>
			<key>Precomposed</key>
			<true/>
			<key>IgnoreManifestScope</key>
			<true/>
		</dict>
	</array>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadIdentifier</key>
	<string>cz.vojtakopecky.batcavegym</string>
	<key>PayloadUUID</key>
	<string>{PROFILE_UUID}</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
	<key>PayloadDisplayName</key>
	<string>Batcave Gym</string>
	<key>PayloadDescription</key>
	<string>Přidá na plochu ikonu tréninkové appky Batcave Gym. Nesbírá žádná data.</string>
	<key>PayloadOrganization</key>
	<string>Vojta Kopecký</string>
	<key>PayloadRemovalDisallowed</key>
	<false/>
</dict>
</plist>
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w", encoding="utf-8").write(xml)
print("profil:", OUT, os.path.getsize(OUT) // 1024, "kB")
