/* Scoped independent previews only. No global model/morph/view writes. */
;(function (global) {
  "use strict";
  const node = typeof module !== "undefined" && module.exports;
  const core = node ? require("./core.js") : global.CLAWLink;
  const { PairState } = node ? require("./pair.js") : global.CLAWPair;
  const requiredCapabilities = Object.freeze(["models.list", "previews.create", "previews.close",
    "previews.scene.get", "previews.morphs.get", "previews.morphs.set", "previews.link"]);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const copy = value => JSON.parse(JSON.stringify(value));
  function frozen(value) {
    if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); }
    return value;
  }
  function failure(code, message) { return Object.assign(new Error(message), { code }); }
  const descriptor = error => ({ code: error.code || "previewFailure", message: error.message || String(error) });
  function binding(preview, sex) { return { id: preview, revision: preview, view: preview, sex }; }
  function morphSnapshot(value) {
    if (!object(value) || !Array.isArray(value.names) || !object(value.values) ||
        value.names.some(name => typeof name !== "string" || !name) || new Set(value.names).size !== value.names.length ||
        Object.entries(value.values).some(([name, number]) => !value.names.includes(name) || typeof number !== "number" || !Number.isFinite(number))) {
      throw failure("invalidResponse", "The host returned an invalid scoped morph snapshot.");
    }
    core.validateMorphNames(value.names);
    return value;
  }
  function readback(value, expectedNames, values) {
    morphSnapshot(value);
    if (value.names.length !== expectedNames.length || expectedNames.some(name => !value.names.includes(name)) ||
        Object.entries(values).some(([name, wanted]) => (value.values[name] || 0) !== wanted)) {
      throw failure("invalidResponse", "The scoped morph response does not confirm the complete requested batch.");
    }
  }

  class PreviewController {
    static get requiredCapabilities() { return requiredCapabilities; }
    static supports(info) {
      return object(info) && info.apiVersion === 1 && Array.isArray(info.capabilities) &&
        requiredCapabilities.every(name => info.capabilities.includes(name)) &&
        (!info.previewLimits || Number.isSafeInteger(info.previewLimits.maxPreviews) && info.previewLimits.maxPreviews >= 2);
    }
    constructor(sdk, catalog, { onState = () => {} } = {}) {
      if (!sdk || typeof sdk.request !== "function" || typeof sdk.connect !== "function" || typeof onState !== "function") {
        throw failure("invalidAdapter", "An SDK and state callback are required.");
      }
      this.sdk = sdk; this.catalog = catalog; this.onState = onState;
      this._state = new PairState(catalog); this._pair = null; this._epoch = 0;
      this._owned = new Map(); this._jobs = []; this._running = false;
      this._replacement = null;
      this._zoomSupported = false; this._zoomActive = false; this._zoomError = null;
      this._zoomValues = new Map(); this._zoomRevisions = new Map(); this._zoomWritten = new Map(); this._zoomSerial = 0;
      if (typeof sdk.on === "function") this._unsubscribe = sdk.on("previews.changed", event => {
        if (!event || !this._owned.has(event.preview)) return;
        if (event.method === "previews.close") {
          this._state.retireClosedPreview(event.preview);
          this._owned.delete(event.preview);
          if (this._pair && [this._pair.human.preview, this._pair.wolf.preview].includes(event.preview)) {
            // close() revokes pair authority immediately and serializes disposal
            // of its surviving owned handle behind any in-flight operation.
            // Internal closes already cleared _pair, so their events cannot
            // recursively enqueue another close or claim another preview.
            const closing = this.close();
            this._notify("previews.changed", failure("previewClosed", "A bound preview was closed. Reopen the pair."));
            closing.catch(() => {}); // close.failed already retains/reports handles.
            return;
          }
        }
        this._notify("previews.changed");
      });
      if (typeof sdk.on === "function") this._unsubscribeView = sdk.on("previews.view.changed", event => this._viewChanged(event));
    }
    get zoomStatus() { return frozen({ available: this._zoomSupported, active: this._zoomActive, error: this._zoomError }); }
    _resetZoom() {
      this._zoomActive = false; this._zoomError = null; ++this._zoomSerial;
      this._zoomValues.clear(); this._zoomRevisions.clear(); this._zoomWritten.clear();
    }
    static _viewZoom(response) {
      const value = response && response.state && response.state.zoom;
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw failure("invalidResponse", "Invalid public preview zoom state.");
      return value;
    }
    async _startZoom(epoch, pair, sourceRole = "human", align = true) {
      if (!this._zoomSupported) return;
      try {
        for (const role of ["human", "wolf"]) {
          const id = pair[role].preview;
          this._zoomValues.set(id, PreviewController._viewZoom(await this._request("previews.view.get", { preview: id }, epoch, pair)));
        }
        const zoom = this._zoomValues.get(pair[sourceRole].preview), target = pair[sourceRole === "human" ? "wolf" : "human"].preview;
        if (align && this._zoomValues.get(target) !== zoom) {
          this._zoomWritten.set(target, zoom);
          const response = await this._request("previews.view.set", { preview: target, zoom }, epoch, pair);
          if (PreviewController._viewZoom(response) !== zoom) throw failure("invalidResponse", "The host did not confirm paired zoom.");
          this._zoomValues.set(target, zoom); this._zoomWritten.delete(target);
        }
        this._assert(epoch, pair); this._zoomActive = true;
      } catch (error) {
        this._assert(epoch, pair); this._zoomActive = false; this._zoomError = descriptor(error);
      }
    }
    _viewChanged(event) {
      const pair = this._pair;
      if (!pair || !event || ![pair.human.preview, pair.wolf.preview].includes(event.preview) ||
          !Number.isSafeInteger(event.revision) || event.revision <= (this._zoomRevisions.get(event.preview) || 0)) return;
      const zoom = event.state && event.state.zoom;
      if (typeof zoom !== "number" || !Number.isFinite(zoom) || zoom <= 0) return;
      this._zoomRevisions.set(event.preview, event.revision);
      const previous = this._zoomValues.get(event.preview); this._zoomValues.set(event.preview, zoom);
      if (!this._zoomActive || this._replacement) return;
      // Native orientation followers and our own exact zoom acknowledgements are
      // observations, never new user intent. This prevents a camera echo loop.
      if (event.source !== event.preview) return;
      if (this._zoomWritten.get(event.preview) === zoom) { this._zoomWritten.delete(event.preview); return; }
      if (previous === zoom) return;
      const serial = ++this._zoomSerial, epoch = this._epoch;
      this._enqueue("zoom", epoch, async () => {
        if (!this._zoomActive || serial !== this._zoomSerial) return;
        // A previous in-flight write can cross a newer opposite-panel gesture.
        // Reconcile BOTH owned views with the latest gesture, without touching
        // orientation, pan, framing, another pair or the host's main model.
        for (const id of [event.preview, pair.human.preview === event.preview ? pair.wolf.preview : pair.human.preview]) {
          this._assert(epoch, pair);
          if (!this._zoomActive || serial !== this._zoomSerial) return;
          if (this._zoomValues.get(id) === zoom) continue;
          this._zoomWritten.set(id, zoom);
          const response = await this._request("previews.view.set", { preview: id, zoom }, epoch, pair);
          if (PreviewController._viewZoom(response) !== zoom) throw failure("invalidResponse", "The host did not confirm paired zoom.");
          if (this._zoomWritten.get(id) === zoom) this._zoomWritten.delete(id);
          if (serial === this._zoomSerial) this._zoomValues.set(id, zoom);
        }
      }).catch(error => {
        if (["stalePair", "superseded"].includes(error.code) || epoch !== this._epoch || pair !== this._pair) return;
        this._zoomActive = false; ++this._zoomSerial; this._zoomError = descriptor(error); this._notify("zoom.failed", error);
      });
    }
    supports(info) { return PreviewController.supports(info); }
    get pair() { return this._pair ? frozen(copy(this._pair)) : null; }
    get failedCleanup() {
      return frozen([...this._owned.values()].filter(item => item.error).map(item => copy(item)));
    }
    _notify(method, error = null) {
      // Observer code cannot turn an accepted host operation into a failed commit.
      try { this.onState({ method, pair: this.pair, error: error ? descriptor(error) : null, failedCleanup: this.failedCleanup }); }
      catch (_) { /* UI observers do not own lifecycle authority. */ }
    }
    _assert(epoch, pair = null) {
      if (epoch !== this._epoch || pair && pair !== this._pair) throw failure("stalePair", "The preview pair changed while the operation was pending.");
    }
    async _request(method, params, epoch, pair = null) {
      const result = await this.sdk.request(method, params); this._assert(epoch, pair); return result;
    }
    async _supported(epoch) {
      const info = await this.sdk.connect(); this._assert(epoch);
      if (!this.supports(info)) throw failure("unsupportedPreviews", "This host does not support the required independent preview methods.");
      this._zoomSupported = typeof this.sdk.on === "function" && ["previews.view.get", "previews.view.set"].every(name => info.capabilities.includes(name));
      return info;
    }
    _enqueue(kind, epoch, run, data = null) {
      return new Promise((resolve, reject) => {
        const last = this._jobs[this._jobs.length - 1];
        if (["apply", "zoom"].includes(kind) && last && last.kind === kind && last.epoch === epoch) {
          last.reject(failure("superseded", kind === "zoom" ? "A newer zoom gesture replaced this unsent view request." : "A newer human vector replaced this unsent preview request."));
          this._jobs.pop();
        }
        this._jobs.push({ kind, epoch, run, data, resolve, reject }); this._pump();
      });
    }
    async _pump() {
      if (this._running) return;
      this._running = true;
      try {
        while (this._jobs.length) {
          const job = this._jobs.shift();
          try { this._assert(job.epoch); job.resolve(await job.run(job.data, job.epoch)); }
          catch (error) { job.reject(error); }
        }
      } finally { this._running = false; }
    }
    async _cleanup(items) {
      const errors = [];
      for (const item of items) {
        if (!this._owned.has(item.preview)) continue;
        try {
          const result = await this.sdk.request("previews.close", { preview: item.preview });
          if (!result || result.closed !== true) throw failure("invalidResponse", "The host did not confirm preview closure.");
          this._state.retireClosedPreview(item.preview);
          this._owned.delete(item.preview);
        } catch (error) {
          if (error.code === "unknownPreview") {
            // The scoped host authoritatively reports that this identity no
            // longer exists, including an old binding's delayed retirement.
            this._state.retireClosedPreview(item.preview); this._owned.delete(item.preview);
          }
          else { item.error = descriptor(error); this._owned.set(item.preview, item); errors.push({ preview: item.preview, ...descriptor(error) }); }
        }
      }
      return errors;
    }
    async _discard(pair, error) {
      if (pair === this._pair) { this._pair = null; this._state.invalidate(); this._epoch += 1; this._resetZoom(); }
      const handles = new Set([pair.human.preview, pair.wolf.preview]);
      const errors = await this._cleanup([...this._owned.values()].filter(item => handles.has(item.preview)));
      if (errors.length) error.cleanupErrors = errors;
      this._notify("failed", error);
    }
    async listModels() {
      const epoch = this._epoch; await this._supported(epoch);
      const result = await this._request("models.list", {}, epoch);
      if (!object(result) || !Array.isArray(result.entries) || result.entries.some(item => !object(item) || typeof item.name !== "string")) {
        throw failure("invalidResponse", "The host returned an invalid model catalogue.");
      }
      return copy(result);
    }
    open(profileId, humanName, wolfName, matrix = null) {
      let profile, selectedMatrix;
      try {
        profile = core.getProfile(this.catalog, profileId);
        selectedMatrix = matrix ? frozen(copy(core.validateMatrix(matrix))) : null;
        if (selectedMatrix && ["id", "sex", "family", "version"].some(name => selectedMatrix[name] !== profile[name])) {
          throw failure("invalidMatrix", "Matrix belongs to a different selected human family.");
        }
        if ([humanName, wolfName].some(name => typeof name !== "string" || !name)) throw failure("invalidModel", "Select both catalogue names explicitly.");
      } catch (error) { return Promise.reject(error); }
      const epoch = ++this._epoch; this._pair = null; this._state.invalidate(); this._resetZoom();
      return this._enqueue("open", epoch, async () => {
        const created = [];
        try {
          const cleanupErrors = await this._cleanup([...this._owned.values()]); this._assert(epoch);
          if (cleanupErrors.length) throw failure("cleanupFailed", "Previous preview cleanup remains unresolved.");
          await this._supported(epoch);
          const models = await this._request("models.list", {}, epoch);
          if (!models || !Array.isArray(models.entries) || [humanName, wolfName].some(name => !models.entries.some(item => item.name === name))) {
            throw failure("invalidModel", "Choose exact names from the host model catalogue.");
          }
          const result = { profileId };
          for (const [role, name] of [["human", humanName], ["wolf", wolfName]]) {
            // Record a late successful create before the epoch check so close()
            // can never strand a handle published while it was waiting.
            const response = await this.sdk.request("previews.create", { name });
            if (!response || typeof response.preview !== "string" || !response.preview || this._owned.has(response.preview)) {
              throw failure("invalidResponse", "The host did not return a new opaque preview handle.");
            }
            const item = { preview: response.preview, name }; this._owned.set(item.preview, item); created.push(item);
            this._assert(epoch);
            if (response.name !== name) throw failure("invalidResponse", "Created preview does not match the selected catalogue name.");
            const scene = await this._request("previews.scene.get", { preview: item.preview }, epoch);
            if (!scene || scene.open !== true) throw failure("invalidResponse", "Created preview has no open scene.");
            const morphs = morphSnapshot(await this._request("previews.morphs.get", { preview: item.preview }, epoch));
            result[role] = { preview: item.preview, name, names: [...morphs.names], scene: copy(scene) };
          }
          const bindings = { human: binding(result.human.preview, profile.sex), wolf: binding(result.wolf.preview, profile.sex) };
          this._state.bind(profileId, bindings);
          this._state.arm({ human: { binding: bindings.human, names: result.human.names }, wolf: { binding: bindings.wolf, names: result.wolf.names } }, selectedMatrix);
          const linked = await this._request("previews.link", {
            previews: [result.human.preview, result.wolf.preview], properties: ["orientation"]
          }, epoch);
          if (!linked || JSON.stringify(linked.previews) !== JSON.stringify([result.human.preview, result.wolf.preview]) ||
              JSON.stringify(linked.properties) !== '["orientation"]') throw failure("invalidResponse", "The host did not confirm the requested orientation link.");
          this._pair = frozen(result); await this._startZoom(epoch, this._pair); this._notify("open"); return this.pair;
        } catch (error) {
          this._state.invalidate();
          const errors = await this._cleanup(created); if (errors.length) error.cleanupErrors = errors;
          this._notify("open.failed", error); throw error;
        }
      });
    }
    replace(role, name, matrix = null, inputs = null) {
      let pair, profile, selectedMatrix, retained = null;
      try {
        if (this._replacement) throw failure("replacementPending", "Wait for the current model replacement.");
        pair = this._pair;
        if (!pair) throw failure("noPair", "Open both previews before replacing a model.");
        if (!["human", "wolf"].includes(role) || typeof name !== "string" || !name) throw failure("invalidModel", "Select a role and an exact catalogue name.");
        profile = core.getProfile(this.catalog, pair.profileId);
        selectedMatrix = matrix ? frozen(copy(core.validateMatrix(matrix))) : null;
        if (inputs !== null) retained = frozen({
          humanValues: core.validateHuman(inputs.humanValues),
          actorWeight: core.validateActorWeight(inputs.actorWeight),
          humanTraits: core.validateTraits(inputs.humanTraits),
        });
        if (selectedMatrix && ["id", "sex", "family", "version"].some(key => selectedMatrix[key] !== profile[key]))
          throw failure("invalidMatrix", "Matrix belongs to a different selected human family.");
        if (pair[role].name === name) return Promise.resolve(this.pair);
      } catch (error) { return Promise.reject(error); }
      // An already-sent paired commit finishes on its original two handles.
      // Cancel unsent vectors/camera work now, block new writes, and fence the
      // replacement only when it reaches that serial boundary. Never invent a
      // partial paired acknowledgement merely to keep a counterpart alive.
      const token = {}; this._replacement = token;
      this._jobs = this._jobs.filter(job => {
        if (!["apply", "zoom"].includes(job.kind)) return true;
        job.reject(failure("superseded", "A model selection replaced this unsent preview request.")); return false;
      });
      return this._enqueue("replace", this._epoch, async () => {
        if (pair !== this._pair) throw failure("stalePair", "The selected comparison pair is no longer current.");
        const epoch = ++this._epoch, other = role === "human" ? "wolf" : "human", created = [];
        this._resetZoom();
        let linkAttempted = false, committed = false;
        try {
          const extras = [...this._owned.values()].filter(item => ![pair.human.preview, pair.wolf.preview].includes(item.preview));
          const cleanupErrors = await this._cleanup(extras); this._assert(epoch, pair);
          if (cleanupErrors.length) throw failure("cleanupFailed", "Previous preview cleanup remains unresolved.");
          const info = await this._supported(epoch);
          if (info.previewLimits && info.previewLimits.maxPreviews < 3)
            throw failure("replacementUnavailable", "This host needs room for a third preview to replace a model without losing the current pair.");
          const models = await this._request("models.list", {}, epoch, pair);
          if (!models || !Array.isArray(models.entries) || !models.entries.some(item => item.name === name))
            throw failure("invalidModel", "Choose an exact name from the host model catalogue.");
          const response = await this.sdk.request("previews.create", {
            name, ...(info.capabilities.includes("previews.create.before") ? { before: pair[role].preview } : {})
          });
          if (!response || typeof response.preview !== "string" || !response.preview || this._owned.has(response.preview))
            throw failure("invalidResponse", "The host did not return a new opaque preview handle.");
          const item = { preview: response.preview, name }; this._owned.set(item.preview, item); created.push(item);
          this._assert(epoch, pair);
          if (response.name !== name) throw failure("invalidResponse", "Created preview does not match the selected catalogue name.");
          const scene = await this._request("previews.scene.get", { preview: item.preview }, epoch, pair);
          if (!scene || scene.open !== true) throw failure("invalidResponse", "Created preview has no open scene.");
          const morphs = morphSnapshot(await this._request("previews.morphs.get", { preview: item.preview }, epoch, pair));
          const result = { ...pair, [role]: { preview: item.preview, name, names: [...morphs.names], scene: copy(scene) } };
          const bindings = { human: binding(result.human.preview, profile.sex), wolf: binding(result.wolf.preview, profile.sex) };
          const snapshots = { human: { binding: bindings.human, names: result.human.names }, wolf: { binding: bindings.wolf, names: result.wolf.names } };
          const candidate = new PairState(this.catalog);
          candidate.bind(pair.profileId, bindings); candidate.arm(snapshots, selectedMatrix);
          // Immediate UI updates require the complete retained vector to fit
          // before committing the new handle and retiring the working model.
          if (retained) candidate.plan(retained.humanValues, selectedMatrix, retained.actorWeight, retained.humanTraits);
          const handles = [pair[other].preview, item.preview];
          linkAttempted = true;
          const linked = await this._request("previews.link", { previews: handles, properties: ["orientation"] }, epoch, pair);
          if (!linked || JSON.stringify(linked.previews) !== JSON.stringify(handles) || JSON.stringify(linked.properties) !== '["orientation"]')
            throw failure("invalidResponse", "The host did not confirm the replacement orientation link.");
          // Rebinding retains acknowledged ownership keyed by the unchanged
          // opaque resource. No coefficients are written during replacement.
          this._state.bind(pair.profileId, bindings); this._state.arm(snapshots, selectedMatrix);
          this._pair = frozen(result); committed = true;
          await this._startZoom(epoch, this._pair, other);
          const errors = await this._cleanup([this._owned.get(pair[role].preview)].filter(Boolean));
          this._assert(epoch, this._pair);
          let warning = null;
          if (errors.length) { warning = failure("cleanupFailed", "The replacement is ready, but the old preview needs a Close retry."); warning.cleanupErrors = errors; }
          this._notify("replace", warning); return this.pair;
        } catch (error) {
          if (!committed) {
            const errors = await this._cleanup(created); if (errors.length) error.cleanupErrors = errors;
            // A refused candidate leaves both old models and their ledgers
            // usable. Re-establish a link only if the staged link was sent.
            if (epoch === this._epoch && pair === this._pair) {
              if (linkAttempted) {
                try { await this._request("previews.link", { previews: [pair.human.preview, pair.wolf.preview], properties: ["orientation"] }, epoch, pair); }
                catch (restoreError) { error.linkError = descriptor(restoreError); }
              }
              await this._startZoom(epoch, pair, "human", false);
            }
          }
          this._notify("replace.failed", error); throw error;
        }
      }).finally(() => { if (this._replacement === token) this._replacement = null; });
    }
    apply(fullHumanVector, matrix = null, actorWeight, humanTraits) {
      let human, selectedMatrix, weight, traits;
      try { if (this._replacement) throw failure("replacementPending", "Wait for the current model replacement before applying values.");
        human = core.validateHuman(fullHumanVector); selectedMatrix = matrix ? frozen(copy(core.validateMatrix(matrix))) : null;
        weight = actorWeight === undefined ? undefined : core.validateActorWeight(actorWeight); traits = core.validateTraits(humanTraits); }
      catch (error) { return Promise.reject(error); }
      return this._enqueue("apply", this._epoch, async (_, epoch) => {
        const pair = this._pair;
        if (!pair) throw failure("noPair", "Open both previews before applying human morphs.");
        this._assert(epoch, pair);
        // PairState validates every supplied human name and every wolf target
        // before either scoped write. Unmapped human TRI names remain present.
        const operation = this._state.plan(human, selectedMatrix, weight, traits);
        const evaluated = selectedMatrix ? core.evaluateMatrix(selectedMatrix, human, weight, traits) : core.evaluate(this.catalog, pair.profileId, human, weight, traits);
        try {
          for (const role of ["human", "wolf"]) {
            if (!Object.keys(operation.values[role]).length) continue;
            const response = await this._request("previews.morphs.set", { preview: pair[role].preview, values: operation.values[role] }, epoch, pair);
            readback(response, pair[role].names, operation.values[role]);
          }
          if (!this._state.acknowledge(operation, { token: operation.token, committed: true, complete: true, bindings: operation.bindings })) {
            throw failure("stalePair", "The paired morph receipt is stale.");
          }
          const result = frozen({ humanValues: copy(operation.values.human), wolfValues: copy(operation.values.wolf),
            unmapped: [...evaluated.unmapped], profile: copy(evaluated.profile), actorWeight: weight, humanTraits: copy(traits), unavailableTraits: [...evaluated.unavailableTraits] });
          this._notify("apply"); return result;
        } catch (error) { await this._discard(pair, error); throw error; }
      });
    }
    async _zero(operation, pair, epoch) {
      try {
        if (Object.keys(operation.values.wolf).length) {
          const response = await this._request("previews.morphs.set", { preview: pair.wolf.preview, values: operation.values.wolf }, epoch, pair);
          readback(response, pair.wolf.names, operation.values.wolf);
        }
        this._assert(epoch, pair);
        if (!this._state.acknowledge(operation, { token: operation.token, committed: true, complete: true, bindings: operation.bindings })) {
          throw failure("stalePair", "The wolf cleanup receipt is stale.");
        }
      } catch (error) { await this._discard(pair, error); throw error; }
    }
    changeProfile(profileId) {
      let profile;
      try { if (this._replacement) throw failure("replacementPending", "Wait for the current model replacement before changing family.");
        profile = core.getProfile(this.catalog, profileId); }
      catch (error) { return Promise.reject(error); }
      return this._enqueue("profile", this._epoch, async (_, epoch) => {
        const pair = this._pair;
        if (!pair) throw failure("noPair", "Open both previews before changing family.");
        const oldProfile = core.getProfile(this.catalog, pair.profileId);
        if (profile.sex !== oldProfile.sex) throw failure("reopenRequired", "Changing resource sex requires reopening the two models.");
        if (profileId === pair.profileId) return this.pair;
        // A generic target set can differ between same-sex families. Validate
        // the next binding before changing authority or clearing acknowledged
        // outputs, so a refused family change leaves the current pair usable.
        const bindings = { human: binding(pair.human.preview, profile.sex), wolf: binding(pair.wolf.preview, profile.sex) };
        const snapshots = { human: { binding: bindings.human, names: pair.human.names }, wolf: { binding: bindings.wolf, names: pair.wolf.names } };
        const candidate = new PairState(this.catalog);
        candidate.bind(profileId, bindings); candidate.arm(snapshots);
        const operation = this._state.changeProfile(profileId); await this._zero(operation, pair, epoch);
        try { this._state.arm(snapshots); }
        catch (error) { await this._discard(pair, error); throw error; }
        this._pair = frozen({ ...pair, profileId }); this._notify("profile"); return this.pair;
      });
    }
    zeroWolf() {
      if (this._replacement) return Promise.reject(failure("replacementPending", "Wait for the current model replacement before clearing values."));
      return this._enqueue("zero", this._epoch, async (_, epoch) => {
        const pair = this._pair;
        if (!pair) throw failure("noPair", "Open both previews before clearing wolf outputs.");
        await this._zero(this._state.cleanup("wolf"), pair, epoch);
        this._notify("zeroWolf"); return this.pair;
      });
    }
    readGeometry() {
      return this._enqueue("geometry", this._epoch, async (_, epoch) => {
        const pair = this._pair;
        if (!pair) throw failure("noPair", "Open both previews before reading their vertices.");
        const info = await this.sdk.connect(); this._assert(epoch, pair);
        if (!info.capabilities.includes("previews.geometry")) throw failure("unsupportedGeometry", "This host lacks the public previews.geometry method.");
        const result = { schemaVersion: 1, kind: "claw-paired-geometry-snapshot", profileId: pair.profileId,
          capturedAt: new Date().toISOString(), space: "model", deltaOrigin: "selected NIF rest positions (baseVertices)",
          precision: "Host browser geometry; int16-quantized morph deltas. Shapes are read sequentially, not atomically.", models: {} };
        for (const role of ["human", "wolf"]) {
          const scene = await this._request("previews.scene.get", { preview: pair[role].preview }, epoch, pair);
          if (!scene || scene.open !== true || !Array.isArray(scene.shapes)) throw failure("invalidResponse", "Invalid scoped shape list.");
          const observedMorphs = morphSnapshot(await this._request("previews.morphs.get", { preview: pair[role].preview }, epoch, pair));
          const model = { name: pair[role].name, morphNames: [...observedMorphs.names], morphValues: copy(observedMorphs.values), shapes: [] };
          for (const shape of scene.shapes) {
            const data = await this._request("previews.geometry", { preview: pair[role].preview, shape: shape.name }, epoch, pair);
            if (!data || data.name !== shape.name || data.space !== "model" || !Array.isArray(data.vertices) ||
                !Array.isArray(data.baseVertices) || data.vertices.length !== data.baseVertices.length || data.vertices.length % 3 ||
                data.vertices.some(value => typeof value !== "number" || !Number.isFinite(value)) ||
                data.baseVertices.some(value => typeof value !== "number" || !Number.isFinite(value))) {
              throw failure("invalidResponse", "The host returned invalid current/rest vertex arrays.");
            }
            const deltas = data.vertices.map((value, index) => value - data.baseVertices[index]);
            if (deltas.some(value => !Number.isFinite(value))) throw failure("invalidResponse", "Vertex displacement overflowed the geometry snapshot.");
            let maximum = 0, squares = 0;
            for (let index = 0; index < deltas.length; index += 3) {
              const length = Math.hypot(deltas[index], deltas[index + 1], deltas[index + 2]);
              maximum = Math.max(maximum, length); squares += length * length;
            }
            model.shapes.push({ name: data.name, space: data.space, vertices: [...data.vertices], baseVertices: [...data.baseVertices],
              deltas, vertexCount: deltas.length / 3, maximumDisplacement: maximum,
              rmsDisplacement: deltas.length ? Math.sqrt(squares / (deltas.length / 3)) : 0 });
          }
          result.models[role] = model;
        }
        for (const role of ["human", "wolf"]) {
          const after = morphSnapshot(await this._request("previews.morphs.get", { preview: pair[role].preview }, epoch, pair));
          const before = result.models[role];
          if (after.names.length !== before.morphNames.length || before.morphNames.some(name =>
              !after.names.includes(name) || (after.values[name] || 0) !== (before.morphValues[name] || 0))) {
            throw failure("staleGeometry", "Model coefficients changed during vertex collection; read again after applying the final values.");
          }
        }
        result.consistency = "Coefficient vectors unchanged at both ends; geometry reads are sequential, not an atomic cross-model snapshot.";
        this._assert(epoch, pair); return result;
      });
    }
    close() {
      const epoch = ++this._epoch; this._pair = null; this._state.invalidate(); this._resetZoom();
      return this._enqueue("close", epoch, async () => {
        const errors = await this._cleanup([...this._owned.values()]);
        if (errors.length) {
          const error = failure("cleanupFailed", "Some owned preview handles could not be closed; retry Close.");
          error.cleanupErrors = errors; this._notify("close.failed", error); throw error;
        }
        this._notify("close"); return { closed: true };
      });
    }
  }
  const api = Object.freeze({ PreviewController, requiredCapabilities });
  if (node) module.exports = api;
  else { global.CLAWPreview = api; global.CLawPreview = api; }
})(typeof window !== "undefined" ? window : globalThis);
