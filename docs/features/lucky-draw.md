# Lucky Draw Requirements

## 1. Purpose

Build a client-side Lucky Draw feature with two separate screens:

1. `/admin` for configuration.
2. `/lucky-draw` for running the draw.

The draw screen must be able to run even if the admin has not configured anything yet. If saved configuration exists in Zustand or `localStorage`, the draw screen must use it. If no saved configuration exists, the draw screen must initialize and use the default configuration.

Lucky Draw configuration and draw results must be managed in Zustand and persisted in `localStorage`.

---

## 2. Screens

## 2.1 `/admin` Configuration Screen

The `/admin` screen is used to configure the Lucky Draw settings.

The admin must be able to configure:

- Draw/event name.
- Prize tiers.
- Ticket range using `from` and `to`.
- Exclusion list using `except`.

The `/admin` screen does not run the draw animation.

The `/admin` screen is responsible for editing and saving configuration into Zustand and `localStorage`.

---

## 2.2 `/lucky-draw` Draw Screen

The `/lucky-draw` screen is used to run the draw.

The draw screen must:

- Load configuration from Zustand if available.
- Hydrate configuration from `localStorage` if Zustand has not been initialized yet.
- Use the default configuration if no valid saved configuration exists.
- Allow prize selection.
- Execute the draw.
- Show digit animation.
- Show final winners.
- Show previous saved draw results/history.

The `/lucky-draw` screen must not require the admin to visit `/admin` first.

---

## 3. Default Behavior

If there is no valid saved configuration in Zustand or `localStorage`, initialize this default configuration:

```ts
const defaultLuckyDrawConfig: LuckyDrawConfig = {
  id: "default",
  name: "Lucky Draw",
  ticketRange: {
    from: 0,
    to: 999,
    except: [],
  },
  prizes: [
    {
      id: "first_prize",
      name: "First Prize",
      winners_count: 1,
      order: 1,
    },
  ],
};
```

Default ticket range:

```ts
from: 0;
to: 999;
except: [];
```

This means `/lucky-draw` can run immediately with ticket numbers from `000` to `999`.

---

## 4. State and Persistence

### 4.1 Zustand Store

Zustand is the in-app source of truth for Lucky Draw state.

The store should manage:

- Current configuration.
- Prize tiers.
- Ticket range.
- Exclusion list.
- Selected prize.
- Draw status.
- Animation state if needed.
- Saved draw results.
- Previous winners derived from saved draw results.

### 4.2 `localStorage` Persistence

Configuration and draw results must be persisted in `localStorage`.

On app start or when entering `/admin` or `/lucky-draw`:

1. Try to read Lucky Draw data from Zustand.
2. If Zustand is not initialized, hydrate Zustand from `localStorage`.
3. Validate and normalize the loaded data.
4. If no valid saved configuration exists, initialize the default configuration.
5. Persist the default configuration if needed.

When configuration changes in `/admin`:

- Update Zustand.
- Persist configuration to `localStorage`.

When a draw is executed in `/lucky-draw`:

- Save the draw result to Zustand.
- Persist draw results to `localStorage`.

Temporary animation-only state does not need to be persisted unless required by the UI.

### 4.3 Recommended Storage Key

Use a versioned key:

```ts
const LUCKY_DRAW_STORAGE_KEY = "lucky-draw:v1";
```

Suggested storage shape:

```ts
type LuckyDrawStorageState = {
  version: 1;
  config: LuckyDrawConfig;
  results: DrawResult[];
  updatedAt: string;
};
```

---

## 5. Domain Models

Use strict TypeScript types. Do not use `any`.

Recommended types:

```ts
type PrizeTier = {
  id: string;
  name: string;
  winners_count: number;
  order: number;
};

type TicketRangeConfig = {
  from: number;
  to: number;
  except: string[];
};

type LuckyDrawConfig = {
  id: string;
  name: string;
  ticketRange: TicketRangeConfig;
  prizes: PrizeTier[];
};

type DrawResult = {
  id: string;
  configId: string;
  prizeId: string;
  prizeName: string;
  winners: string[];
  drawSettingsSnapshot: {
    from: number;
    to: number;
    displayDigits: number;
    except: string[];
    winners_count: number;
  };
  createdAt: string;
};

type DrawStatus = "idle" | "drawing" | "animating" | "completed" | "error";
```

---

## 6. Admin Configuration Requirements

The `/admin` screen must allow editing the Lucky Draw configuration.

Configuration must support multiple prize tiers.

Each prize tier must have:

- `id`
- `name`
- `winners_count`
- `order`

Example:

```ts
type PrizeTier = {
  id: string;
  name: string;
  winners_count: number;
  order: number;
};
```

The admin must be able to save configuration changes.

Saved configuration must be available to `/lucky-draw`.

---

## 7. Ticket Range and Formatting

## 7.1 Custom Numeric Range Only

The system uses a custom numeric range only.

The configuration shape is:

```ts
type TicketRangeConfig = {
  from: number;
  to: number;
  except: string[];
};
```

Example:

```json
{
  "from": 0,
  "to": 999,
  "except": ["013", "088", "999"]
}
```

## 7.2 Range Rules

- `from` is required.
- `to` is required.
- `from` must be a non-negative integer.
- `to` must be a non-negative integer.
- `from <= to`.
- Negative ticket numbers are not supported.
- Decimal ticket numbers are not supported.
- Alphanumeric ticket codes are not supported.

## 7.3 Digit Length Rule

The admin must not manually select digit length.

The display digit length is calculated from `to`:

```ts
const displayDigits = String(to).length;
```

Examples:

| From |   To | Display Digits | Example Display |
| ---: | ---: | -------------: | --------------- |
|    0 |    9 |              1 | `7`             |
|    0 |   99 |              2 | `07`            |
|    0 |  999 |              3 | `007`           |
|  100 | 9999 |              4 | `0100`          |

## 7.4 Ticket Formatting Rule

Every ticket number must be formatted with leading zeroes according to `displayDigits`.

Example:

```ts
formatTicket(7, 3) === "007";
formatTicket(42, 3) === "042";
formatTicket(999, 3) === "999";
```

The same formatting rule must be applied to:

- Generated ticket pool.
- Exclusion list.
- Previous winners.
- New winners.
- Winners shown in the UI.
- Winners persisted to `localStorage`.

---

## 8. Exclusion Rules

The admin can provide an exclusion list using `except`.

Excluded tickets must never be selected as winners.

The exclusion list must be normalized using the same display digit length.

Example:

```json
{
  "from": 0,
  "to": 99,
  "except": ["1", "07", "99"]
}
```

With `displayDigits = 2`, the normalized exclusion set is:

```json
["01", "07", "99"]
```

Invalid exclusion values should be rejected with a clear error message.

Invalid exclusion examples:

- Values outside the configured range.
- Negative values.
- Decimal values.
- Non-numeric values.

---

## 9. Draw Execution

Winner generation runs in the browser.

The draw logic should be implemented as pure, testable TypeScript functions where practical.

The `/lucky-draw` screen may trigger draw execution through a Zustand action such as:

```ts
executeDraw(prizeId: string): DrawResult
```

or equivalent.

The draw result must be calculated before any animation starts.

The animation must only reveal winners that have already been calculated and saved into Zustand and `localStorage`.

---

## 10. Draw Algorithm

The draw execution must follow this sequence:

1. Ensure Zustand has been initialized.
2. If no valid config exists, initialize the default config.
3. Read the current config from the Zustand store.
4. Validate the selected prize exists.
5. Validate `winners_count` is a positive integer.
6. Validate `from` and `to`.
7. Calculate `displayDigits` from `to`.
8. Generate all tickets from `from` to `to`.
9. Format all tickets using leading zeroes.
10. Normalize `except` using the same formatting rule.
11. Load previous winners from saved results.
12. Remove excluded tickets from the candidate pool.
13. Remove previous winners from the candidate pool.
14. Validate that enough available tickets remain.
15. Pick all winners before animation starts.
16. Create a `DrawResult`.
17. Save the `DrawResult` into Zustand.
18. Persist the updated results to `localStorage`.
19. Start animation using the saved winners.
20. Display the final result.

---

## 11. Randomness Requirements

Use browser crypto:

```ts
crypto.getRandomValues;
```

Do not use:

```ts
Math.random;
```

The random integer selection must avoid modulo bias.

Use rejection sampling when converting random bytes to an index.

Example implementation:

```ts
function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error("maxExclusive must be a positive integer");
  }

  const array = new Uint32Array(1);
  const maxUint32 = 0xffffffff;
  const limit = maxUint32 - (maxUint32 % maxExclusive);

  let value: number;

  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);

  return value % maxExclusive;
}
```

---

## 12. Winner Selection Rules

Winner selection must be done without replacement.

A ticket cannot win twice in the same draw result.

A ticket that already won a previous prize in the same local Lucky Draw event/config cannot win again.

Default rule:

- Previous winners are scoped to the current local Lucky Draw config/event.
- A ticket can win at most once per config/event.

Example:

```ts
function pickWinners(availableTickets: string[], count: number): string[] {
  if (availableTickets.length < count) {
    throw new Error("Not enough available tickets");
  }

  const pool = [...availableTickets];
  const winners: string[] = [];

  for (let i = 0; i < count; i++) {
    const index = secureRandomInt(pool.length);
    winners.push(pool[index]);
    pool.splice(index, 1);
  }

  return winners;
}
```

---

## 13. Duplicate Draw Protection

The system must protect against accidental duplicate execution.

Requirements:

- Disable the draw button while draw execution or animation is in progress.
- Zustand must track a draw status such as `drawing` or `animating`.
- By default, the same prize should not be drawn more than once for the same local config/event.
- If a prize was already drawn, the UI must show the saved result and prevent drawing again.
- If redraw is needed later, it must be implemented as an explicit workflow.

Duplicate prevention is enforced in the Zustand store and persisted `localStorage` results.

---

## 14. `/admin` UI Requirements

The `/admin` screen must show configuration controls for:

- Draw/event name.
- Prize list.
- Prize name.
- Prize winner count.
- Prize order.
- Ticket range `from`.
- Ticket range `to`.
- Exclusion list `except`.

The `/admin` screen should show validation errors before saving invalid configuration.

The `/admin` screen should provide a clear save/update action if configuration is not saved automatically.

---

## 15. `/lucky-draw` UI Requirements

The `/lucky-draw` screen must show:

- Current draw configuration name.
- Prize list.
- Selected prize.
- Winner count for the selected prize.
- Ticket range.
- Exclusion count.
- Number of available tickets if practical.
- Draw button.
- Animation area.
- Final winners grid/list.
- Previous results/history.

If no saved configuration exists, `/lucky-draw` must use the default configuration and still allow drawing immediately.

---

## 16. Prize Selection

The admin must select one prize tier before drawing.

If there is only one prize tier, it may be selected by default.

The selected prize must be displayed clearly.

Example:

```txt
Now Drawing: First Prize
Winners: 1
Range: 000 - 999
```

If the selected prize was already drawn, the UI must show the saved result and prevent drawing again.

---

## 17. Animation Requirements

The animation must never calculate winners.

The animation must only reveal winners already generated by the draw logic and saved in the store.

Required sequence:

1. Admin clicks Draw.
2. Zustand action validates config.
3. Zustand action calculates winners.
4. Zustand action saves result to state and `localStorage`.
5. UI starts animation using the saved winners.
6. UI displays the final saved result.

Forbidden sequence:

1. Admin clicks Draw.
2. Digits spin.
3. UI calculates the winner during or after spinning.

### Digit Boxes

The UI must render digit boxes dynamically using `displayDigits`.

Examples:

| `displayDigits` | UI Boxes          |
| --------------: | ----------------- |
|               1 | `[7]`             |
|               2 | `[0] [7]`         |
|               3 | `[0] [0] [7]`     |
|               4 | `[0] [0] [4] [2]` |

Do not hard-code the number of digit boxes.

### Digit Animation

The digit animation must follow these requirements:

- Each digit box spins independently.
- Digits stop from left to right.
- The final digit values must match the saved winning ticket.
- Use the deceleration curve `[0.12, 0, 0.39, 0]`.

For CSS:

```css
transition-timing-function: cubic-bezier(0.12, 0, 0.39, 0);
```

For Framer Motion:

```ts
transition={{
  ease: [0.12, 0, 0.39, 0]
}}
```

---

## 18. Multiple Winners Display

The system must support prizes with multiple winners.

All winners must be calculated and saved before animation starts.

For a small number of winners, the UI may animate winners one by one.

For large winner lists, the UI must avoid heavy animation and show a clean grid/list instead.

Suggested threshold:

- `winners_count <= 20`: digit reveal animation is allowed.
- `winners_count > 20`: skip per-winner digit animation and show a simple result grid/list.

The final result must always be displayed in a clean and readable format.

---

## 19. Result Display

After the draw animation finishes, show the saved winners.

Example:

```txt
First Prize Winner

007
```

For multiple winners:

```txt
Special Award Winners

007   042   315   608   721
```

For large result sets:

- Use a responsive grid or list.
- Avoid expensive per-item animations.
- Consider pagination or virtualization if the list can become very large.

---

## 20. Validation Requirements

The system must validate configuration before saving and before executing a draw.

Validation rules:

- `from` is required.
- `to` is required.
- `from` must be an integer.
- `to` must be an integer.
- `from` must be greater than or equal to `0`.
- `to` must be greater than or equal to `0`.
- `from <= to`.
- `winners_count` must be a positive integer.
- `except` must be an array.
- Every exclusion value must be numeric.
- Every exclusion value must be inside the configured range.
- The selected prize must exist.
- The selected prize must not have already been drawn unless redraw is explicitly supported.
- The available ticket count must be greater than or equal to `winners_count`.

---

## 21. Error Handling Requirements

The UI must show clear error messages.

Required error cases:

### Invalid Range

```txt
Invalid ticket range. The starting number must be less than or equal to the ending number.
```

### Invalid Exclusion

```txt
Invalid exclusion list. Ticket 1000 is outside the configured range 000-999.
```

### Not Enough Tickets

```txt
Not enough available tickets to draw 10 winners. Only 7 tickets are available.
```

### Prize Already Drawn

```txt
This prize has already been drawn.
```

### Storage Error

```txt
Unable to save Lucky Draw data to this browser. Please check local storage permissions or available space.
```

### Invalid Saved Data

```txt
Saved Lucky Draw data is invalid. The default configuration has been restored.
```

The UI must not start animation if validation or draw execution fails.

---

## 22. Local Data Integrity

Because persistence is browser-local, the system must be defensive when reading from `localStorage`.

Requirements:

- Wrap `localStorage` reads and writes in `try-catch`.
- Validate parsed JSON before hydrating Zustand.
- Fall back to the default config when saved config is missing or invalid.
- Preserve existing results when possible.
- Store timestamps for draw results.
- Store the draw settings snapshot with every result.
- Do not assume saved local data is valid.

---

## 23. Acceptance Criteria

### `/admin`

- Admin can edit the Lucky Draw configuration.
- Admin can edit prize tiers.
- Admin can edit `from`, `to`, and `except`.
- Configuration is saved to Zustand and `localStorage`.
- Saved configuration is available to `/lucky-draw`.

### `/lucky-draw`

- The draw screen works even if `/admin` has never been visited.
- If no saved config exists, the default range is `from = 0` and `to = 999`.
- If saved config exists, `/lucky-draw` uses the saved config.
- Admin can select a prize.
- Admin can trigger the draw.
- UI shows the current selected prize clearly.
- UI renders digit boxes based on `displayDigits`.
- UI animates digits independently.
- UI uses the deceleration curve `[0.12, 0, 0.39, 0]`.
- UI stops digits from left to right.
- UI never calculates winners during animation.
- UI displays final winners in a clean grid/list.
- UI shows saved previous results/history.

### Draw Execution

- Winner generation runs in the browser using `crypto.getRandomValues`.
- `Math.random` is not used for winner selection.
- All winners are calculated before animation starts.
- The draw respects exclusions.
- The draw respects previous winners for the same local config/event.
- The draw prevents duplicate winners.
- The draw result is saved to Zustand.
- The draw result is persisted to `localStorage`.
- Refreshing the page still shows saved config and previous draw results.

---

## 24. Recommended Implementation Flow

### `/admin` Flow

```txt
Admin opens /admin
-> App initializes Lucky Draw store
-> Store loads saved data from localStorage if available
-> If no valid config exists, store initializes default config
-> Admin edits config
-> App validates config
-> App saves config to Zustand
-> App persists config to localStorage
```

### `/lucky-draw` Flow

```txt
User opens /lucky-draw
-> App initializes Lucky Draw store
-> Store loads saved data from localStorage if available
-> If no valid config exists, store initializes default config from 0 to 999
-> User selects prize
-> User clicks Draw
-> UI disables Draw button
-> Zustand action validates config and selected prize
-> Zustand action calculates displayDigits from `to`
-> Zustand action builds ticket pool
-> Zustand action removes exclusions
-> Zustand action removes previous winners
-> Zustand action securely picks all winners using crypto.getRandomValues
-> Zustand action creates DrawResult
-> Zustand action saves result to store
-> Store persists result to localStorage
-> UI starts animation using saved winners
-> UI displays final winners
```

---

## 25. Non-Negotiable Rules

These rules must not be violated:

1. Use `/admin` for configuration.
2. Use `/lucky-draw` for running the draw.
3. `/lucky-draw` must work even if `/admin` has never been visited.
4. Use `localStorage` to persist Lucky Draw config and results.
5. Use Zustand to manage Lucky Draw state.
6. If no config exists, initialize `from = 0`, `to = 999`, and `except = []`.
7. Do not calculate winners during animation.
8. Do not use `Math.random` for winner selection.
9. Use `crypto.getRandomValues` for winner selection.
10. Do not allow excluded tickets to win.
11. Do not allow previous winners to win again for the same local config/event.
12. Do not hard-code the number of digit boxes.
13. Do not require admin to choose digit length manually.
14. Do not require realtime broadcast or multi-client synchronization.
