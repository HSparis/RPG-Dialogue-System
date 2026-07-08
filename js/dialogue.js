/**
 * RPG DIALOGUE SYSTEM
 * Developed by Sparis
 * 
 * Main class to handle immersive, video game-style interactive branching dialogues.
 * Extends Foundry VTT's ApplicationV2 with multi-system support.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class RPGDialogueSystem extends HandlebarsApplicationMixin(ApplicationV2) {
  
  // ========================================
  // CONSTRUCTOR & INITIALIZATION
  // ========================================

  constructor(npcToken, journalEntry, initialPageId, options = {}) {
    super(options);
    this.npcToken = npcToken;
    this.journalEntry = journalEntry;
    
    this.currentPage = this.journalEntry.pages.getName(initialPageId) || 
                       this.journalEntry.pages.get(initialPageId) || 
                       this.journalEntry.pages.contents[0];
    
    this.currentVoiceAudio = null;
    this.typewriterInterval = null;
    this.fullNPCText = "";
    this.activeAudios = [];
    this.typewriterBipPath = null; 
  }

  static DEFAULT_OPTIONS = {
    id: "rpg-dialogue-window",
    tag: "div",
    window: {
      frame: false,
      resizable: false
    },
    position: {
      width: 620
    }
  };

  static PARTS = {
    form: {
      template: "modules/rpg-dialogue-system/dialogue.hbs"
    }
  };

  // ========================================
  // CONTEXT PREPARATION (DATA BINDING)
  // ========================================

  async _prepareContext(options) {
    if (!this.currentPage) {
      const errorMsg = game.i18n.localize("NPC_DIALOGUE.PageNotFound") || "Error: Page not found.";
      return {
        npcName: this.npcToken?.name || "NPC",
        playerName: "Player",
        npcText: errorMsg,
        textoNPC: errorMsg,
        options: [],
        playerOptions: [],
        audioPaths: [],
        imgNPC: this.npcToken?.document?.texture?.src || "icons/svg/mystery-man.svg",
        imgPlayer: "icons/svg/mystery-man.svg",
        npcClass: "disposition-neutral"
      };
    }

    const rawHtml = this.currentPage.text?.content || "";
    const processedData = this._processHtmlContent(rawHtml);

    let imgPlayerPath = "icons/svg/mystery-man.svg"; 
    let playerName = "Player";

    if (canvas?.tokens?.controlled && canvas.tokens.controlled.length > 0) {
      const controlledToken = canvas.tokens.controlled[0];
      if (controlledToken) {
        imgPlayerPath = controlledToken.document?.texture?.src || "icons/svg/mystery-man.svg";
        playerName = controlledToken.name || "Player";
      }
    }

    const imgNPCPath = this.npcToken?.document?.texture?.src || "icons/svg/mystery-man.svg";
    const disposition = this.npcToken?.document?.disposition ?? 0;
    let npcClass = "disposition-neutral";

    if (disposition === -2) npcClass = "disposition-secret";
    else if (disposition === -1) npcClass = "disposition-hostile";
    else if (disposition === 1) npcClass = "disposition-friendly";

    return {
      npcName: this.npcToken?.name || "NPC",
      playerName: playerName,
      jogadorName: playerName, 
      npcText: processedData.npcText || "",
      textoNPC: processedData.npcText || "", 
      textoNpc: processedData.npcText || "", 
      options: processedData.playerOptions || [],
      opcoes: processedData.playerOptions || [], 
      opcoesJogador: processedData.playerOptions || [], 
      audioPaths: processedData.audioPaths || [],
      imgNPC: imgNPCPath,
      imgPlayer: imgPlayerPath,
      imgJogador: imgPlayerPath, 
      npcClass: npcClass
    };
  }

  _processHtmlContent(fullHtml) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(fullHtml, 'text/html');
    const audioPaths = [];
    const playerOptions = [];

    const audioTags = doc.querySelectorAll('audio');
    audioTags.forEach(tag => {
      const src = tag.getAttribute('src');
      if (src) audioPaths.push(src);
      tag.remove(); 
    });

    const links = doc.querySelectorAll('a');
    links.forEach(link => {
      const nextId = link.getAttribute('data-proximo-id') || link.getAttribute('data-proximo') || link.getAttribute('data-next-id');

      playerOptions.push({
        texto: link.textContent,
        text: link.textContent,
        proximoId: nextId,
        nextId: nextId,
        gatilho: link.getAttribute('data-gatilho') || link.getAttribute('data-trigger') || null,
        trigger: link.getAttribute('data-gatilho') || link.getAttribute('data-trigger') || null,
        itemId: link.getAttribute('data-item-id') || null,
        quantidade: parseInt(link.getAttribute('data-quantidade')) || parseInt(link.getAttribute('data-quantity')) || 1,
        quantity: parseInt(link.getAttribute('data-quantidade')) || parseInt(link.getAttribute('data-quantity')) || 1,
        pericia: link.getAttribute('data-pericia') || link.getAttribute('data-skill') || null,
        skill: link.getAttribute('data-pericia') || link.getAttribute('data-skill') || null,
        cd: parseInt(link.getAttribute('data-cd')) || parseInt(link.getAttribute('data-dc')) || null,
        dc: parseInt(link.getAttribute('data-cd')) || parseInt(link.getAttribute('data-dc')) || null
      });
      link.remove(); 
    });

    return {
      npcText: doc.body.innerHTML,
      playerOptions: playerOptions,
      audioPaths: audioPaths
    };
  }

  // ========================================
  // TYPEWRITER EFFECT (TEXT ANIMATION)
  // ========================================

  _applyTypewriterEffect(windowElement, textToType) {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    
    const textBox = windowElement.querySelector('.dialogo-texto-npc');
    const optionsContainer = windowElement.querySelector('.dialogo-opcoes-lista');
    const mainContainer = windowElement.querySelector('.modulo-dialogo-container');
    const scrollContainer = mainContainer || textBox;
    
    if (!textBox) return;

    if (optionsContainer) {
      optionsContainer.style.setProperty("opacity", "0", "important");
      optionsContainer.style.setProperty("pointer-events", "none", "important");
    }

    this.fullNPCText = textToType;
    let currentIndex = 0;
    textBox.innerHTML = ""; 

    // LÊ AS CONFIGURAÇÕES DINÂMICAS DO GAME SETTINGS
    const useTypewriter = game.settings.get("rpg-dialogue-system", "useTypewriter");
    const typingSpeed = game.settings.get("rpg-dialogue-system", "typingSpeed") || 25;

    const finishTyping = () => {
      if (this.typewriterInterval) {
        clearInterval(this.typewriterInterval);
        this.typewriterInterval = null;
      }
      textBox.innerHTML = this.fullNPCText;
      
      if (optionsContainer) {
        optionsContainer.style.setProperty("opacity", "1", "important");
        optionsContainer.style.setProperty("pointer-events", "auto", "important");
      }
      this.setPosition();

      if (scrollContainer) {
        scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "smooth" });
      }
    };

    // SE O EFEITO ESTIVER DESATIVADO NAS CONFIGURAÇÕES, MOSTRA INSTANTANEAMENTE
    if (!useTypewriter) {
      finishTyping();
      return;
    }

    this.typewriterInterval = setInterval(() => {
      if (!windowElement.isConnected) {
        clearInterval(this.typewriterInterval);
        this.typewriterInterval = null;
        return;
      }

      if (currentIndex >= this.fullNPCText.length) {
        finishTyping();
        return;
      }

      if (this.fullNPCText[currentIndex] === "<") {
        const tagEnd = this.fullNPCText.indexOf(">", currentIndex);
        if (tagEnd !== -1) {
          textBox.innerHTML += this.fullNPCText.substring(currentIndex, tagEnd + 1);
          currentIndex = tagEnd + 1;
          this.setPosition();
          return;
        }
      }

      textBox.innerHTML += this.fullNPCText[currentIndex];
      
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }

      if (this.typewriterBipPath && this.fullNPCText[currentIndex] !== " ") {
        foundry.audio.AudioHelper.play({ src: this.typewriterBipPath, volume: 0.15, loop: false }, false);
      }

      currentIndex++;
      this.setPosition();
    }, typingSpeed);

    if (mainContainer) {
      const handleContainerClick = (event) => {
        if (event.target.closest('.opcao-resposta')) return;
        if (this.typewriterInterval) {
          event.preventDefault();
          event.stopPropagation();
          finishTyping();
        }
      };
      mainContainer.removeEventListener('click', handleContainerClick);
      mainContainer.addEventListener('click', handleContainerClick);
    }
  }

  // ========================================
  // DOM RENDERING & STYLING
  // ========================================

  _onRender(context, options) {
    super._onRender(context, options);
    
    const windowElement = this.element;
    if (!windowElement) return;

    windowElement.style.setProperty("position", "fixed", "important");
    windowElement.style.setProperty("left", "50%", "important");
    windowElement.style.setProperty("top", "52%", "important"); 
    windowElement.style.setProperty("transform", "translate(-50%, -50%)", "important");
    windowElement.style.setProperty("margin", "0", "important");
    windowElement.style.setProperty("z-index", "99999", "important");
    windowElement.style.setProperty("opacity", "0", "important"); 
    windowElement.style.setProperty("transition", "opacity 0.4s ease-out, top 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.125)", "important");
    windowElement.style.setProperty("width", "620px", "important");
    windowElement.style.setProperty("height", "auto", "important"); 
    windowElement.style.setProperty("background", "rgba(15, 15, 15, 0.95)", "important");
    windowElement.style.setProperty("border", "1px solid #444", "important");
    windowElement.style.setProperty("border-radius", "10px", "important");
    windowElement.style.setProperty("box-shadow", "0 0 30px rgba(0,0,0,0.95)", "important");
    windowElement.style.setProperty("padding", "20px", "important");
    windowElement.style.setProperty("box-sizing", "border-box", "important");
    windowElement.style.setProperty("display", "block", "important");
    windowElement.style.setProperty("visibility", "visible", "important");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        windowElement.style.setProperty("top", "50%", "important");
        windowElement.style.setProperty("opacity", "1", "important");
      });
    });

    const mainContainer = windowElement.querySelector('.modulo-dialogo-container');
    if (mainContainer) {
      mainContainer.style.setProperty("display", "flex", "important");
      mainContainer.style.setProperty("flex-direction", "column", "important");
      mainContainer.style.setProperty("width", "100%", "important");
      mainContainer.style.setProperty("height", "auto", "important"); 
      mainContainer.style.setProperty("justify-content", "flex-start", "important"); 
      mainContainer.style.setProperty("gap", "15px", "important"); 
    }

    const portraitRow = windowElement.querySelector('.dialogo-linha-retratos');
    if (portraitRow) {
      portraitRow.style.setProperty("display", "flex", "important");
      portraitRow.style.setProperty("justify-content", "space-between", "important");
      portraitRow.style.setProperty("width", "100%", "important");
      portraitRow.style.setProperty("height", "auto", "important"); 
    }

    windowElement.querySelectorAll('.dialogo-avatar-img').forEach(img => {
      img.style.setProperty("width", "100px", "important");
      img.style.setProperty("height", "100px", "important");
      img.style.setProperty("object-fit", "cover", "important");
      img.style.setProperty("border", "2px solid #555", "important");
      img.style.setProperty("border-radius", "6px", "important");
      img.style.setProperty("display", "block", "important");
    });

    windowElement.querySelectorAll('.dialogo-bloco-avatar').forEach(block => {
      block.style.setProperty("display", "flex", "important");
      block.style.setProperty("flex-direction", "column", "important");
      block.style.setProperty("align-items", "center", "important");
      block.style.setProperty("gap", "5px", "important");
    });

    const bottomBlock = windowElement.querySelector('.dialogo-bloco-inferior');
    if (bottomBlock) {
      bottomBlock.style.setProperty("display", "flex", "important");
      bottomBlock.style.setProperty("flex-direction", "column", "important");
      bottomBlock.style.setProperty("background", "rgba(0, 0, 0, 0.5)", "important");
      bottomBlock.style.setProperty("padding", "15px", "important");
      bottomBlock.style.setProperty("border-radius", "6px", "important");
      bottomBlock.style.setProperty("gap", "10px", "important");
      bottomBlock.style.setProperty("width", "100%", "important");
    }

    const npcTextBox = windowElement.querySelector('.dialogo-texto-npc');
    if (npcTextBox) {
      npcTextBox.style.setProperty("color", "#fff", "important");
      npcTextBox.style.setProperty("font-size", "14px", "important");
      npcTextBox.style.setProperty("line-height", "1.4", "important");
      npcTextBox.style.setProperty("margin-bottom", "5px", "important");
    }

    const optionsList = windowElement.querySelector('.dialogo-opcoes-lista');
    if (optionsList) {
      optionsList.style.setProperty("display", "flex", "important");
      optionsList.style.setProperty("flex-direction", "column", "important");
      optionsList.style.setProperty("gap", "8px", "important");
    }

    if (this.currentVoiceAudio) { this.currentVoiceAudio.stop(); this.currentVoiceAudio = null; }
    if (this.activeAudios && this.activeAudios.length > 0) {
      this.activeAudios.forEach(sound => { if (sound && typeof sound.stop === "function") sound.stop(); });
    }
    this.activeAudios = []; 

    if (context.audioPaths && context.audioPaths.length > 0) {
      context.audioPaths.forEach(path => {
        foundry.audio.AudioHelper.play({ src: path, volume: 0.8, loop: false }, false)
          .then(sound => { if (sound) this.activeAudios.push(sound); })
          .catch(err => console.warn(`RPG Dialogue System | Error playing audio [${path}]:`, err));
      });
    }

    const npcTextContent = context.npcText || "";
    this._applyTypewriterEffect(windowElement, npcTextContent);

    windowElement.querySelectorAll('.opcao-resposta').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        const target = event.currentTarget;
        
        const extraData = {
          itemId: target.getAttribute('data-item-id'),
          quantity: parseInt(target.getAttribute('data-quantidade')) || parseInt(target.getAttribute('data-quantity')) || 1,
          skill: target.getAttribute('data-pericia') || target.getAttribute('data-skill'),
          dc: parseInt(target.getAttribute('data-cd')) || parseInt(target.getAttribute('data-dc')) || null
        };
        
        const nextId = target.getAttribute('data-proximo-id') || target.getAttribute('data-next-id');
        const trigger = target.getAttribute('data-gatilho') || target.getAttribute('data-trigger');
        
        this.advanceDialogue(nextId, trigger, extraData);
      });
    });
  }

  // ========================================
  // ROUTING & TRIGGER ENGINE
  // ========================================

  async advanceDialogue(nextId, trigger = null, extraData = {}) {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }

    const playerToken = canvas.tokens.controlled[0] || canvas.tokens.placeables.find(t => t.actor?.id === game.user.character?.id);

    if (trigger === "combate" || trigger === "combat") {
      const npcToken = this.npcToken;
      if (npcToken) {
        ui.notifications.info(`Starting combat against ${npcToken.name}!`);
        let combat = game.combats.viewed || await Combat.create({ scene: canvas.scene.id });
        const combatants = [];
        if (!npcToken.inCombat) combatants.push({ tokenId: npcToken.id, actorId: npcToken.actor.id, hidden: npcToken.document.hidden });
        if (playerToken && !playerToken.inCombat) combatants.push({ tokenId: playerToken.id, actorId: playerToken.actor.id, hidden: playerToken.document.hidden });
        if (combatants.length > 0) await combat.createEmbeddedDocuments("Combatant", combatants);
        await combat.startCombat();
      }
    }

    if ((trigger === "receber-item" || trigger === "receive-item") && extraData.itemId) {
      if (!playerToken) {
        ui.notifications.warn("You must have a controlled Token to receive this item.");
      } else {
        const originalItem = game.items.get(extraData.itemId) || game.items.getName(extraData.itemId);
        if (originalItem) {
          const itemData = originalItem.toObject();
          if (itemData.system && 'quantity' in itemData.system) {
            itemData.system.quantity = extraData.quantity;
          }
          await playerToken.actor.createEmbeddedDocuments("Item", [itemData]);
          ui.notifications.info(`${playerToken.name} received ${extraData.quantity}x ${originalItem.name}!`);
        } else {
          ui.notifications.warn(`Item '${extraData.itemId}' was not found in the global Items directory.`);
        }
      }
    }

    if ((trigger === "pedir-item" || trigger === "demand-item" || trigger === "give-item") && extraData.itemId) {
      if (!playerToken) {
        ui.notifications.warn("You must select your Token to hand over the item.");
        return; 
      }

      const itemInInventory = playerToken.actor.items.get(extraData.itemId) || playerToken.actor.items.getName(extraData.itemId);
      if (!itemInInventory) {
        ui.notifications.warn(`You do not possess the item '${extraData.itemId}' in your inventory.`);
        return; 
      }

      const currentQuantity = itemInInventory.system?.quantity ?? 1;
      const quantityToRemove = extraData.quantity;

      if (currentQuantity < quantityToRemove) {
        ui.notifications.warn(`You don't have enough '${itemInInventory.name}' (Has: ${currentQuantity}, Needs: ${quantityToRemove}).`);
        return; 
      }

      if (currentQuantity === quantityToRemove) {
        await itemInInventory.delete();
      } else {
        await itemInInventory.update({ "system.quantity": currentQuantity - quantityToRemove });
      }
      ui.notifications.info(`You handed over ${quantityToRemove}x ${itemInInventory.name}.`);
    }

    if ((trigger === "teste-pericia" || trigger === "skill-check") && extraData.skill && (extraData.dc || extraData.cd)) {
      if (!playerToken) {
        ui.notifications.warn(game.i18n.localize("NPC_DIALOGUE.WarningNoToken") || "You must have a controlled Token to perform this check.");
        return;
      }

      const activeSystem = game.system.id; 
      const targetDC = parseInt(extraData.dc || extraData.cd);
      let testPassed = false;

      if (activeSystem.includes("v20") || activeSystem.includes("vampire") || activeSystem.includes("vtm")) {
        testPassed = await this._executeV20Roll(playerToken, extraData, targetDC);
      } else {
        testPassed = await this._executeD20Roll(playerToken, extraData, targetDC);
      }

      if (testPassed) {
        ui.notifications.info(game.i18n.localize("NPC_DIALOGUE.SuccessNotification") || "Success on check!");
      } else {
        ui.notifications.warn(game.i18n.localize("NPC_DIALOGUE.FailNotification") || "Failure on check.");
        nextId = `${nextId}_falha`;
      }

      const skillResultPage = this.journalEntry.pages.getName(nextId);
      if (skillResultPage) {
        this.currentPage = skillResultPage;
        this.render({ force: true });
        return; 
      } else {
        ui.notifications.warn(`Result page '${nextId}' was not found in the Journal.`);
      }
    }

    if (nextId === "fechar" || nextId === "close") {
      this.stopAudioAndExit();
      return;
    }

    const nextPage = this.journalEntry.pages.getName(nextId);
    if (!nextPage) {
      this.stopAudioAndExit();
      return;
    }

    this.currentPage = nextPage;
    this.render({ force: true });
  }

  // ========================================
  // INTERNAL DICE ENGINES
  // ========================================

  async _executeV20Roll(playerToken, extraData, targetDC) {
    let baseDicePool = 0;
    const splitKeys = extraData.skill.toLowerCase().split("+");

    splitKeys.forEach(key => {
      key = key.trim();
      const attributeVal = playerToken.actor.system.attributes?.[key]?.value;
      const abilityVal = playerToken.actor.system.abilities?.[key]?.value;

      if (typeof attributeVal === "number") baseDicePool += attributeVal;
      if (typeof abilityVal === "number") baseDicePool += abilityVal;
    });

    const finalDicePool = baseDicePool > 0 ? baseDicePool : 6;
    const rollFormula = `${finalDicePool}d10`;
    const rollInstance = await new Roll(rollFormula).evaluate();

    let rawSuccesses = rollInstance.dice[0].results.filter(d => d.result >= targetDC).length;
    const botches = rollInstance.dice[0].results.filter(d => d.result === 1).length;
    let netSuccesses = Math.max(0, rawSuccesses - botches);

    const tSheetDice = game.i18n.localize("NPC_DIALOGUE.DiceFromSheet") || "Sheet Dice";
    const tDifficulty = game.i18n.localize("NPC_DIALOGUE.Difficulty") || "Difficulty";
    const tSuccesses = game.i18n.localize("NPC_DIALOGUE.Successes") || "Successes";
    const tCancel = game.i18n.localize("NPC_DIALOGUE.Cancel") || "1s (Botches)";
    const tFinalSuccesses = game.i18n.localize("NPC_DIALOGUE.FinalSuccesses") || "Net Successes";
    const tSkillCheck = game.i18n.localize("NPC_DIALOGUE.SkillCheck") || "Skill Check";

    const chatContent = `
      <b>${tSheetDice}:</b> ${finalDicePool}d10 (${tDifficulty} ${targetDC})<br>
      <b>${tSuccesses}:</b> ${rawSuccesses} | <b>${tCancel}:</b> ${botches}<br>
      <b>${tFinalSuccesses}:</b> ${netSuccesses}
    `;

    await rollInstance.toMessage({
      flavor: `<b>${tSkillCheck} (V20):</b> ${extraData.skill.toUpperCase()}<br>${chatContent}`,
      speaker: ChatMessage.getSpeaker({ token: playerToken })
    });

    return netSuccesses >= 1;
  }

  async _executeD20Roll(playerToken, extraData, targetDC) {
    const activeSystem = game.system.id;
    let skillKey = extraData.skill.toLowerCase().trim();
    let skillModifier = 0;

if (activeSystem === "dnd5e") {
      // D&D 5e usa abreviações de 3 letras na ficha. Esse dicionário converte automaticamente:
      const dnd5eSkillsMap = {
        "acrobatics": "acr", "animal-handling": "ani", "animal handling": "ani", "arcana": "arc",
        "athletics": "ath", "deception": "dec", "history": "his", "insight": "ins",
        "intimidation": "itm", "investigation": "inv", "medicine": "med", "nature": "nat",
        "perception": "prc", "performance": "prf", "persuasion": "per", "religion": "rel",
        "sleight-of-hand": "slt", "sleight of hand": "slt", "stealth": "ste", "survival": "sur"
      };
      
      if (dnd5eSkillsMap[skillKey]) skillKey = dnd5eSkillsMap[skillKey];
      skillModifier = playerToken.actor.system.skills?.[skillKey]?.total || 0;

    } else if (activeSystem.includes("tormenta") || activeSystem.includes("t20")) {
      // Mapeia termos em inglês do Journal para o sistema em português do T20
      const t20SkillsMap = {
        "insight": "intuicao",
        "athletics": "atletismo",
        "perception": "percepcao",
        "stealth": "furtividade",
        "deception": "enganacao",
        "history": "historia",
        "religion": "religiao"
      };
      
      if (t20SkillsMap[skillKey]) skillKey = t20SkillsMap[skillKey];
      skillModifier = playerToken.actor.system.skills?.[skillKey]?.modificador || 0;

    } else if (activeSystem.includes("pf2e") || activeSystem.includes("pathfinder")) {
      // Pathfinder 2e usa o nome cheio em inglês (ex: "athletics", "stealth")
      // Redireciona "insight" para "perception" já que insight não existe como perícia separada no PF2e
      if (skillKey === "insight") skillKey = "perception"; 
      skillModifier = playerToken.actor.system.skills?.[skillKey]?.totalModifier || 0;
      
    } else {
      // Caso seja outro sistema genérico
      skillModifier = playerToken.actor.system.skills?.[skillKey]?.total || 0;
    }
    
    const rollFormula = `1d20 + ${skillModifier}`;
    const rollInstance = await new Roll(rollFormula).evaluate();
    const totalResult = rollInstance.total;

    const tTotalResult = game.i18n.localize("NPC_DIALOGUE.TotalResult") || "Total Result";
    const tSkillCheck = game.i18n.localize("NPC_DIALOGUE.SkillCheck") || "Skill Check";

    const chatContent = `<b>${tTotalResult}:</b> ${totalResult} (DC ${targetDC})`;

    await rollInstance.toMessage({
      flavor: `<b>${tSkillCheck} (D&D 5e):</b> ${extraData.skill.toUpperCase()}<br>${chatContent}`,
      speaker: ChatMessage.getSpeaker({ token: playerToken })
    });

    return totalResult >= targetDC;
  }

  // ========================================
  // LIFECYCLE EXIT & CLEANUP
  // ========================================

  stopAudioAndExit() {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }

    if (this.activeAudios && this.activeAudios.length > 0) {
      this.activeAudios.forEach(sound => { if (sound && typeof sound.stop === "function") sound.stop(); });
    }
    this.activeAudios = [];
    
    const windowElement = this.element;
    if (windowElement) {
      windowElement.style.setProperty("opacity", "0", "important");
      windowElement.style.setProperty("top", "52%", "important");
      setTimeout(() => this.close({ animate: false }), 400);
    } else {
      this.close({ animate: false });
    }
  }
}

// ========================================
// GLOBAL EVENT LISTENERS & SETTINGS (HOOKS)
// ========================================

Hooks.once("init", () => {
  // 1. Configuração para a Tecla de Interação
  game.settings.register("rpg-dialogue-system", "interactionKey", {
    name: "NPC_DIALOGUE.Settings.KeyName",
    hint: "NPC_DIALOGUE.Settings.KeyHint",
    scope: "world",
    config: true,
    type: String,
    default: "t",
    requiresReload: true
  });

  // 2. Configuração para a Distância Máxima
  game.settings.register("rpg-dialogue-system", "maxDistance", {
    name: "NPC_DIALOGUE.Settings.DistName",
    hint: "NPC_DIALOGUE.Settings.DistHint",
    scope: "world",
    config: true,
    type: Number,
    default: 3.5,
    requiresReload: true
  });

  // 3. NOVA CONFIGURAÇÃO: ATIVAR/DESATIVAR TYPEWRITER
  game.settings.register("rpg-dialogue-system", "useTypewriter", {
    name: "NPC_DIALOGUE.Settings.TypewriterName",
    hint: "NPC_DIALOGUE.Settings.TypewriterHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  // 4. NOVA CONFIGURAÇÃO: VELOCIDADE DA DIGITAÇÃO
  game.settings.register("rpg-dialogue-system", "typingSpeed", {
    name: "NPC_DIALOGUE.Settings.SpeedName",
    hint: "NPC_DIALOGUE.Settings.SpeedHint",
    scope: "world",
    config: true,
    type: Number,
    default: 25,
    requiresReload: true
  });

  window.addEventListener("keydown", (event) => {
    if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.isContentEditable) return;

    const configuredKey = (game.settings.get("rpg-dialogue-system", "interactionKey") || "t").toLowerCase();
    
    if (event.key.toLowerCase() === configuredKey) {
      event.preventDefault();
      _handleNPCInteraction();
    }
  });
});

function _handleNPCInteraction() {
  let npcToken = Array.from(game.user.targets)[0];
  if (!npcToken && canvas.tokens.hover) {
    npcToken = canvas.tokens.hover;
  }

  if (!npcToken || !npcToken.actor || npcToken.actor.hasPlayerOwner) return;

  if (!game.user.isGM) {
    const playerToken = canvas.tokens.controlled[0];
    
    if (!playerToken) {
      ui.notifications.warn(game.i18n.localize("NPC_DIALOGUE.Notification.SelectToken") || "You must control a Token first.");
      return;
    }

    const maxAllowedDistance = game.settings.get("rpg-dialogue-system", "maxDistance") || 3.5;
    const gridSize = canvas.grid.size || 100;
    const dx = (playerToken.x + playerToken.w / 2) - (npcToken.x + npcToken.w / 2);
    const dy = (playerToken.y + playerToken.h / 2) - (npcToken.y + npcToken.h / 2);
    const pixelDistance = Math.hypot(dx, dy);
    const gridSquaresDistance = pixelDistance / gridSize;
    
    if (gridSquaresDistance > maxAllowedDistance) {
      ui.notifications.warn(game.i18n.format("NPC_DIALOGUE.Notification.TooFar", { name: npcToken.name }) || `You are too far away from ${npcToken.name}.`);
      return;
    } 
  }

  const dialogueFolder = game.folders.find(f => f.name === "Diálogos de NPCs" && f.type === "JournalEntry");
  let npcJournal = null;
  
  if (dialogueFolder) {
    npcJournal = game.journal.contents.find(j => j.name === npcToken.actor.name && j.folder?.id === dialogueFolder.id);
  } else {
    npcJournal = game.journal.getName(npcToken.actor.name);
  }

  if (!npcJournal) {
    if (game.user.isGM) {
      ui.notifications.error(game.i18n.format("NPC_DIALOGUE.Notification.CreateJournal", { name: npcToken.actor.name }) || `Create a Journal entry named "${npcToken.actor.name}".`);
    } else {
      ui.notifications.info(game.i18n.format("NPC_DIALOGUE.Notification.NoDialogue", { name: npcToken.name }) || `${npcToken.name} has nothing to say.`);
    }
    return;
  }

  npcToken.setTarget(false, {releaseOthers: false, groupSelection: true});

  const dialogueWindow = new RPGDialogueSystem(npcToken, npcJournal, "inicio");
  dialogueWindow.render({ force: true });
}