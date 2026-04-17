# Accessibility Checklist

WCAG 2.1 AA compliance checklist. Use alongside the `react-engineering` skill.

## Keyboard Navigation

- [ ] All interactive elements reachable via Tab key
- [ ] Tab order follows visual/logical reading order
- [ ] Focus indicator visible on all focusable elements
- [ ] No keyboard traps (user can always Tab away)
- [ ] Escape closes modals, dropdowns, and overlays
- [ ] Enter/Space activates buttons and links
- [ ] Arrow keys navigate within composite widgets (tabs, menus, listboxes)

## Screen Reader

- [ ] All images have `alt` text (decorative images use `alt=""`)
- [ ] Icon-only buttons have `aria-label`
- [ ] Form inputs associated with labels (`htmlFor` or `aria-label`)
- [ ] Heading hierarchy is sequential (h1 → h2 → h3, no skipping)
- [ ] One `h1` per page
- [ ] Landmark regions used (`main`, `nav`, `aside`, `footer`)
- [ ] Dynamic content updates announced (`role="status"`, `role="alert"`, `aria-live`)
- [ ] Tables have `<caption>` or `aria-label` and proper `<th>` headers

## Color and Contrast

- [ ] Normal text: ≥4.5:1 contrast ratio
- [ ] Large text (18px+ or 14px+ bold): ≥3:1 contrast ratio
- [ ] UI components and graphical objects: ≥3:1 contrast ratio
- [ ] Color is never the sole indicator of state (add icons, text, or patterns)
- [ ] Focus indicators have sufficient contrast against background

## Forms

- [ ] Every input has a visible label (not just placeholder)
- [ ] Required fields marked with text (not just `*` or color)
- [ ] Error messages descriptive and associated with the field (`aria-describedby`)
- [ ] Error state announced to screen readers (`role="alert"` or `aria-live="assertive"`)
- [ ] Autocomplete attributes on common fields (name, email, address, etc.)
- [ ] Form validation feedback is immediate and accessible

## Focus Management

- [ ] Focus moves into modal/dialog when opened
- [ ] Focus trapped within open modal (Tab cycles within)
- [ ] Focus returns to trigger element when modal closes
- [ ] Focus managed after route changes (move to main content or heading)
- [ ] Skip-to-content link present on pages with navigation

## Motion and Media

- [ ] Animations respect `prefers-reduced-motion` media query
- [ ] No content flashes more than 3 times per second
- [ ] Auto-playing media has pause/stop controls
- [ ] Video has captions or transcript

## Responsive and Touch

- [ ] Touch targets: minimum 44x44px
- [ ] No horizontal scrolling at any viewport width
- [ ] Content readable at 200% zoom
- [ ] Orientation not locked (works in portrait and landscape)

## Testing

```bash
# Automated checks (catches ~30% of issues)
npx axe-core         # Or Lighthouse accessibility audit
npx pa11y            # CLI accessibility testing

# Manual checks (catches the rest)
# 1. Tab through entire page — all interactive elements reachable?
# 2. Screen reader walkthrough (VoiceOver on Mac: Cmd+F5)
# 3. Zoom to 200% — anything break?
# 4. Check with browser DevTools accessibility tree
```
