import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const DBUS_INTERFACE = `
<node>
  <interface name="org.atracker.WindowTracker">
    <method name="GetActiveWindow">
      <arg type="s" direction="out" name="window_json"/>
    </method>
    <signal name="ActiveWindowChanged">
      <arg type="s" name="window_json"/>
    </signal>
  </interface>
</node>`;

export default class AtrackerExtension extends Extension {
    _dbusId = null;
    _focusSignalId = null;

    enable() {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(DBUS_INTERFACE, this);
        this._dbusImpl.export(Gio.DBus.session, '/org/atracker/WindowTracker');

        this._dbusId = Gio.DBus.session.own_name(
            'org.atracker.WindowTracker',
            Gio.BusNameOwnerFlags.NONE,
            null,
            null,
        );

        this._focusSignalId = global.display.connect('notify::focus-window', () => {
            const json = this._getActiveWindowJson();
            this._dbusImpl.emit_signal(
                'ActiveWindowChanged',
                new GLib.Variant('(s)', [json]),
            );
        });

        console.log('[atracker] Extension enabled');
    }

    disable() {
        if (this._focusSignalId) {
            global.display.disconnect(this._focusSignalId);
            this._focusSignalId = null;
        }

        if (this._dbusImpl) {
            this._dbusImpl.unexport();
            this._dbusImpl = null;
        }

        if (this._dbusId) {
            Gio.DBus.session.unown_name(this._dbusId);
            this._dbusId = null;
        }

        console.log('[atracker] Extension disabled');
    }

    _getActiveWindowJson() {
        const win = global.display.focus_window;
        if (!win) {
            return JSON.stringify({ wm_class: '', title: '', pid: 0 });
        }

        return JSON.stringify({
            wm_class: win.get_wm_class() || '',
            title: win.get_title() || '',
            pid: win.get_pid() || 0,
        });
    }

    // DBus method implementation
    GetActiveWindow() {
        return this._getActiveWindowJson();
    }
}
