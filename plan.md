1. **Understand the battery optimization issue**: Polling every minute, even via coroutines, runs unnecessarily whenever the device is awake. The optimal Android solution is to listen for system broadcasts (`Intent.ACTION_DATE_CHANGED`, `Intent.ACTION_TIME_CHANGED`, `Intent.ACTION_TIMEZONE_CHANGED`) to trigger updates exactly when needed without polling.
2. **Update MainViewModel**:
   - Add `@ApplicationContext private val context: Context` to the `MainViewModel` constructor.
   - Use a `callbackFlow` to register a `BroadcastReceiver` that listens for the aforementioned intents.
   - Combine the flow logic to emit the start and end bounds of the day when these broadcasts occur, falling back on an initial emission so data loads immediately on startup.
   - Maintain `.distinctUntilChanged()` to ensure the downstream collector only re-queries the database when the day bounds *actually* change.
3. **Run tests**: Execute `./gradlew test` to ensure everything still passes.
4. **Pre-commit steps**: Run pre-commit checks using `pre_commit_instructions`.
5. **Submit**: Submit the newly optimized changes.
