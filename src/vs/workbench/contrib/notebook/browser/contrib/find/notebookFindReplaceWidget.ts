/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { FindInput, IFindInputOptions, IFindInputStyles } from 'vs/base/browser/ui/findinput/findInput';
import { IReplaceInputStyles, ReplaceInput } from 'vs/base/browser/ui/findinput/replaceInput';
import { IMessage as InputBoxMessage } from 'vs/base/browser/ui/inputbox/inputBox';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { Widget } from 'vs/base/browser/ui/widget';
import { Delayer } from 'vs/base/common/async';
import { KeyCode } from 'vs/base/common/keyCodes';
import 'vs/css!./notebookFindReplaceWidget';
import { FindReplaceState, FindReplaceStateChangedEvent } from 'vs/editor/contrib/find/browser/findState';
import { findNextMatchIcon, findPreviousMatchIcon, findReplaceAllIcon, findReplaceIcon, SimpleButton } from 'vs/editor/contrib/find/browser/findWidget';
import * as nls from 'vs/nls';
import { ContextScopedReplaceInput, registerAndCreateHistoryNavigationContext } from 'vs/platform/history/browser/contextScopedHistoryWidget';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { editorWidgetBackground, editorWidgetBorder, editorWidgetForeground, editorWidgetResizeBorder, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground, inputBackground, inputBorder, inputForeground, inputValidationErrorBackground, inputValidationErrorBorder, inputValidationErrorForeground, inputValidationInfoBackground, inputValidationInfoBorder, inputValidationInfoForeground, inputValidationWarningBackground, inputValidationWarningBorder, inputValidationWarningForeground, widgetShadow } from 'vs/platform/theme/common/colorRegistry';
import { registerIcon, widgetClose } from 'vs/platform/theme/common/iconRegistry';
import { attachProgressBarStyler } from 'vs/platform/theme/common/styler';
import { IColorTheme, IThemeService, registerThemingParticipant, ThemeIcon } from 'vs/platform/theme/common/themeService';
import { parseReplaceString, ReplacePattern } from 'vs/editor/contrib/find/browser/replacePattern';
import { Codicon } from 'vs/base/common/codicons';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Action, ActionRunner, IAction, IActionRunner, Separator } from 'vs/base/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMenu, IMenuService } from 'vs/platform/actions/common/actions';
import { createAndFillInActionBarActions } from 'vs/platform/actions/browser/menuEntryActionViewItem';
import { AnchorAlignment, IContextViewProvider } from 'vs/base/browser/ui/contextview/contextview';
import { DropdownMenuActionViewItem } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { filterIcon } from 'vs/workbench/contrib/extensions/browser/extensionsIcons';
import { NotebookFindFilters } from 'vs/workbench/contrib/notebook/browser/contrib/find/findFilters';
import { isSafari } from 'vs/base/common/platform';
import { ISashEvent, Orientation, Sash } from 'vs/base/browser/ui/sash/sash';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

const NLS_FIND_INPUT_LABEL = nls.localize('label.find', "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize('placeholder.find', "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize('label.previousMatchButton', "Previous Match");
// const NLS_FILTER_BTN_LABEL = nls.localize('label.findFilterButton', "Search in View");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize('label.nextMatchButton', "Next Match");
const NLS_CLOSE_BTN_LABEL = nls.localize('label.closeButton', "Close");
const NLS_TOGGLE_REPLACE_MODE_BTN_LABEL = nls.localize('label.toggleReplaceButton', "Toggle Replace");
const NLS_REPLACE_INPUT_LABEL = nls.localize('label.replace', "Replace");
const NLS_REPLACE_INPUT_PLACEHOLDER = nls.localize('placeholder.replace', "Replace");
const NLS_REPLACE_BTN_LABEL = nls.localize('label.replaceButton', "Replace");
const NLS_REPLACE_ALL_BTN_LABEL = nls.localize('label.replaceAllButton', "Replace All");

export const findFilterButton = registerIcon('find-filter', Codicon.filter, nls.localize('findFilterIcon', 'Icon for Find Filter in find widget.'));
const NOTEBOOK_FIND_FILTERS = nls.localize('notebook.find.filter.filterAction', "Find Filters");
const NOTEBOOK_FIND_IN_MARKUP_INPUT = nls.localize('notebook.find.filter.findInMarkupInput', "Markdown Source");
const NOTEBOOK_FIND_IN_MARKUP_PREVIEW = nls.localize('notebook.find.filter.findInMarkupPreview', "Rendered Markdown");
const NOTEBOOK_FIND_IN_CODE_INPUT = nls.localize('notebook.find.filter.findInCodeInput', "Code Cell Source");
const NOTEBOOK_FIND_IN_CODE_OUTPUT = nls.localize('notebook.find.filter.findInCodeOutput', "Cell Output");

const NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH = 318;
const NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING = 4;
class NotebookFindFilterActionViewItem extends DropdownMenuActionViewItem {
	constructor(readonly filters: NotebookFindFilters, action: IAction, actionRunner: IActionRunner, @IContextMenuService contextMenuService: IContextMenuService) {
		super(action,
			{ getActions: () => this.getActions() },
			contextMenuService,
			{
				actionRunner,
				classNames: action.class,
				anchorAlignmentProvider: () => AnchorAlignment.RIGHT
			}
		);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.updateChecked();
	}

	private getActions(): IAction[] {
		const markdownInput: IAction = {
			checked: this.filters.markupInput,
			class: undefined,
			enabled: !this.filters.markupPreview,
			id: 'findInMarkdownInput',
			label: NOTEBOOK_FIND_IN_MARKUP_INPUT,
			run: async () => {
				this.filters.markupInput = !this.filters.markupInput;
			},
			tooltip: ''
		};

		const markdownPreview: IAction = {
			checked: this.filters.markupPreview,
			class: undefined,
			enabled: true,
			id: 'findInMarkdownInput',
			label: NOTEBOOK_FIND_IN_MARKUP_PREVIEW,
			run: async () => {
				this.filters.markupPreview = !this.filters.markupPreview;
			},
			tooltip: ''
		};

		const codeInput: IAction = {
			checked: this.filters.codeInput,
			class: undefined,
			enabled: true,
			id: 'findInCodeInput',
			label: NOTEBOOK_FIND_IN_CODE_INPUT,
			run: async () => {
				this.filters.codeInput = !this.filters.codeInput;
			},
			tooltip: ''
		};

		const codeOutput = {
			checked: this.filters.codeOutput,
			class: undefined,
			enabled: true,
			id: 'findInCodeOutput',
			label: NOTEBOOK_FIND_IN_CODE_OUTPUT,
			run: async () => {
				this.filters.codeOutput = !this.filters.codeOutput;
			},
			tooltip: '',
			dispose: () => null
		};

		if (isSafari) {
			return [
				markdownInput,
				codeInput
			];
		} else {
			return [
				markdownInput,
				markdownPreview,
				new Separator(),
				codeInput,
				codeOutput,
			];
		}

	}

	override updateChecked(): void {
		this.element!.classList.toggle('checked', this._action.checked);
	}
}

class NotebookFindInput extends FindInput {
	private _filterButtonContainer: HTMLElement;
	private _actionbar: ActionBar | null = null;
	private _filterChecked: boolean = false;
	private _filtersAction: IAction;

	constructor(
		readonly filters: NotebookFindFilters,
		contextKeyService: IContextKeyService,
		readonly contextMenuService: IContextMenuService,
		readonly instantiationService: IInstantiationService,
		parent: HTMLElement | null, contextViewProvider: IContextViewProvider, showOptionButtons: boolean, options: IFindInputOptions) {
		super(parent, contextViewProvider, showOptionButtons, options);

		this._register(registerAndCreateHistoryNavigationContext(contextKeyService, this.inputBox));
		this._filtersAction = new Action('notebookFindFilterAction', NOTEBOOK_FIND_FILTERS, 'notebook-filters ' + ThemeIcon.asClassName(filterIcon));
		this._filtersAction.checked = false;
		this._filterButtonContainer = dom.$('.find-filter-button');
		this.controls.appendChild(this._filterButtonContainer);
		this.createFilters(this._filterButtonContainer);

		this._register(this.filters.onDidChange(() => {
			if (this.filters.codeInput !== true || this.filters.codeOutput !== false || this.filters.markupInput !== true || this.filters.markupPreview !== false) {
				this._filtersAction.checked = true;
			} else {
				this._filtersAction.checked = false;
			}
		}));

		this.inputBox.paddingRight = this.caseSensitive.width() + this.wholeWords.width() + this.regex.width() + this.getFilterWidth();
	}

	private getFilterWidth() {
		return 2 /*margin left*/ + 2 /*border*/ + 2 /*padding*/ + 16 /* icon width */;
	}

	private createFilters(container: HTMLElement): void {
		this._actionbar = this._register(new ActionBar(container, {
			actionViewItemProvider: action => {
				if (action.id === this._filtersAction.id) {
					return this.instantiationService.createInstance(NotebookFindFilterActionViewItem, this.filters, action, new ActionRunner());
				}
				return undefined;
			}
		}));
		this._actionbar.push(this._filtersAction, { icon: true, label: false });
	}

	override setEnabled(enabled: boolean) {
		super.setEnabled(enabled);
		if (enabled && !this._filterChecked) {
			this.regex.enable();
		} else {
			this.regex.disable();
		}
	}

	updateFilterState(changed: boolean) {
		this._filterChecked = changed;
		if (this._filterChecked) {
			this.regex.disable();
			this.regex.domNode.tabIndex = -1;
			this.regex.domNode.classList.toggle('disabled', true);
		} else {
			this.regex.enable();
			this.regex.domNode.tabIndex = 0;
			this.regex.domNode.classList.toggle('disabled', false);
		}
		this.applyStyles();
	}

	override applyStyles(): void {
		super.applyStyles();

		this._filterButtonContainer.style.borderColor = this._filterChecked && this.inputActiveOptionBorder ? this.inputActiveOptionBorder.toString() : '';
		this._filterButtonContainer.style.color = this._filterChecked && this.inputActiveOptionForeground ? this.inputActiveOptionForeground.toString() : 'inherit';
		this._filterButtonContainer.style.backgroundColor = this._filterChecked && this.inputActiveOptionBackground ? this.inputActiveOptionBackground.toString() : '';
	}

	getCellToolbarActions(menu: IMenu): { primary: IAction[]; secondary: IAction[] } {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

		return result;
	}
}

export abstract class SimpleFindReplaceWidget extends Widget {
	protected readonly _findInput: NotebookFindInput;
	private readonly _domNode: HTMLElement;
	private readonly _innerFindDomNode: HTMLElement;
	private readonly _focusTracker: dom.IFocusTracker;
	private readonly _findInputFocusTracker: dom.IFocusTracker;
	private readonly _updateHistoryDelayer: Delayer<void>;
	protected readonly _matchesCount!: HTMLElement;
	private readonly prevBtn: SimpleButton;
	private readonly nextBtn: SimpleButton;

	protected readonly _replaceInput!: ReplaceInput;
	private readonly _innerReplaceDomNode!: HTMLElement;
	private _toggleReplaceBtn!: SimpleButton;
	private readonly _replaceInputFocusTracker!: dom.IFocusTracker;
	protected _replaceBtn!: SimpleButton;
	protected _replaceAllBtn!: SimpleButton;

	private readonly _resizeSash: Sash;
	private _resizeOriginalWidth = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;

	private _isVisible: boolean = false;
	private _isReplaceVisible: boolean = false;
	private foundMatch: boolean = false;

	protected _progressBar!: ProgressBar;
	protected _scopedContextKeyService: IContextKeyService;

	private _filters: NotebookFindFilters;

	constructor(
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService protected readonly _configurationService: IConfigurationService,
		@IMenuService readonly menuService: IMenuService,
		@IContextMenuService readonly contextMenuService: IContextMenuService,
		@IInstantiationService readonly instantiationService: IInstantiationService,
		protected readonly _state: FindReplaceState<NotebookFindFilters> = new FindReplaceState<NotebookFindFilters>(),
		protected readonly _notebookEditor: INotebookEditor,
	) {
		super();

		this._filters = new NotebookFindFilters(true, false, true, false);
		this._state.change({ filters: this._filters }, false);

		this._filters.onDidChange(() => {
			this._state.change({ filters: this._filters }, false);
		});

		this._domNode = document.createElement('div');
		this._domNode.classList.add('simple-fr-find-part-wrapper');
		this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
		this._scopedContextKeyService = contextKeyService.createScoped(this._domNode);

		const progressContainer = dom.$('.find-replace-progress');
		this._progressBar = new ProgressBar(progressContainer);
		this._register(attachProgressBarStyler(this._progressBar, this._themeService));
		this._domNode.appendChild(progressContainer);

		// Toggle replace button
		this._toggleReplaceBtn = this._register(new SimpleButton({
			label: NLS_TOGGLE_REPLACE_MODE_BTN_LABEL,
			className: 'codicon toggle left',
			onTrigger: () => {
				this._isReplaceVisible = !this._isReplaceVisible;
				this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
				if (this._isReplaceVisible) {
					this._innerReplaceDomNode.style.display = 'flex';
				} else {
					this._innerReplaceDomNode.style.display = 'none';
				}
			}
		}));
		this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
		this._domNode.appendChild(this._toggleReplaceBtn.domNode);


		this._innerFindDomNode = document.createElement('div');
		this._innerFindDomNode.classList.add('simple-fr-find-part');

		this._findInput = this._register(new NotebookFindInput(
			this._filters,
			this._scopedContextKeyService,
			this.contextMenuService,
			this.instantiationService,
			null,
			this._contextViewService,
			true,
			{
				label: NLS_FIND_INPUT_LABEL,
				placeholder: NLS_FIND_INPUT_PLACEHOLDER,
				validation: (value: string): InputBoxMessage | null => {
					if (value.length === 0 || !this._findInput.getRegex()) {
						return null;
					}
					try {
						new RegExp(value);
						return null;
					} catch (e) {
						this.foundMatch = false;
						this.updateButtons(this.foundMatch);
						return { content: e.message };
					}
				},
				flexibleWidth: true,
			}
		));

		// Find History with update delayer
		this._updateHistoryDelayer = new Delayer<void>(500);

		this.oninput(this._findInput.domNode, (e) => {
			this.foundMatch = this.onInputChanged();
			this.updateButtons(this.foundMatch);
			this._delayedUpdateHistory();
		});

		this._register(this._findInput.inputBox.onDidChange(() => {
			this._state.change({ searchString: this._findInput.getValue() }, true);
		}));

		this._findInput.setRegex(!!this._state.isRegex);
		this._findInput.setCaseSensitive(!!this._state.matchCase);
		this._findInput.setWholeWords(!!this._state.wholeWord);

		this._register(this._findInput.onDidOptionChange(() => {
			this._state.change({
				isRegex: this._findInput.getRegex(),
				wholeWord: this._findInput.getWholeWords(),
				matchCase: this._findInput.getCaseSensitive()
			}, true);
		}));

		this._register(this._state.onFindReplaceStateChange(() => {
			this._findInput.setRegex(this._state.isRegex);
			this._findInput.setWholeWords(this._state.wholeWord);
			this._findInput.setCaseSensitive(this._state.matchCase);
			this._replaceInput.setPreserveCase(this._state.preserveCase);
			this.findFirst();
		}));

		this._matchesCount = document.createElement('div');
		this._matchesCount.className = 'matchesCount';
		this._updateMatchesCount();

		this.prevBtn = this._register(new SimpleButton({
			label: NLS_PREVIOUS_MATCH_BTN_LABEL,
			icon: findPreviousMatchIcon,
			onTrigger: () => {
				this.find(true);
			}
		}));

		this.nextBtn = this._register(new SimpleButton({
			label: NLS_NEXT_MATCH_BTN_LABEL,
			icon: findNextMatchIcon,
			onTrigger: () => {
				this.find(false);
			}
		}));

		const closeBtn = this._register(new SimpleButton({
			label: NLS_CLOSE_BTN_LABEL,
			icon: widgetClose,
			onTrigger: () => {
				this.hide();
			}
		}));

		this._innerFindDomNode.appendChild(this._findInput.domNode);
		this._innerFindDomNode.appendChild(this._matchesCount);
		this._innerFindDomNode.appendChild(this.prevBtn.domNode);
		this._innerFindDomNode.appendChild(this.nextBtn.domNode);
		this._innerFindDomNode.appendChild(closeBtn.domNode);

		// _domNode wraps _innerDomNode, ensuring that
		this._domNode.appendChild(this._innerFindDomNode);

		this.onkeyup(this._innerFindDomNode, e => {
			if (e.equals(KeyCode.Escape)) {
				this.hide();
				e.preventDefault();
				return;
			}
		});

		this._focusTracker = this._register(dom.trackFocus(this._innerFindDomNode));
		this._register(this._focusTracker.onDidFocus(this.onFocusTrackerFocus.bind(this)));
		this._register(this._focusTracker.onDidBlur(this.onFocusTrackerBlur.bind(this)));

		this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
		this._register(this._findInputFocusTracker.onDidFocus(this.onFindInputFocusTrackerFocus.bind(this)));
		this._register(this._findInputFocusTracker.onDidBlur(this.onFindInputFocusTrackerBlur.bind(this)));

		this._register(dom.addDisposableListener(this._innerFindDomNode, 'click', (event) => {
			event.stopPropagation();
		}));

		// Replace
		this._innerReplaceDomNode = document.createElement('div');
		this._innerReplaceDomNode.classList.add('simple-fr-replace-part');

		this._replaceInput = this._register(new ContextScopedReplaceInput(null, undefined, {
			label: NLS_REPLACE_INPUT_LABEL,
			placeholder: NLS_REPLACE_INPUT_PLACEHOLDER,
			history: []
		}, contextKeyService, false));
		this._innerReplaceDomNode.appendChild(this._replaceInput.domNode);
		this._replaceInputFocusTracker = this._register(dom.trackFocus(this._replaceInput.domNode));
		this._register(this._replaceInputFocusTracker.onDidFocus(this.onReplaceInputFocusTrackerFocus.bind(this)));
		this._register(this._replaceInputFocusTracker.onDidBlur(this.onReplaceInputFocusTrackerBlur.bind(this)));

		this._domNode.appendChild(this._innerReplaceDomNode);

		if (this._isReplaceVisible) {
			this._innerReplaceDomNode.style.display = 'flex';
		} else {
			this._innerReplaceDomNode.style.display = 'none';
		}

		this._replaceBtn = this._register(new SimpleButton({
			label: NLS_REPLACE_BTN_LABEL,
			icon: findReplaceIcon,
			onTrigger: () => {
				this.replaceOne();
			}
		}));

		// Replace all button
		this._replaceAllBtn = this._register(new SimpleButton({
			label: NLS_REPLACE_ALL_BTN_LABEL,
			icon: findReplaceAllIcon,
			onTrigger: () => {
				this.replaceAll();
			}
		}));

		this._innerReplaceDomNode.appendChild(this._replaceBtn.domNode);
		this._innerReplaceDomNode.appendChild(this._replaceAllBtn.domNode);

		this._resizeSash = this._register(new Sash(this._domNode, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL, size: 2 }));

		this._register(this._resizeSash.onDidStart(() => {
			this._resizeOriginalWidth = this._getDomWidth();
		}));

		this._register(this._resizeSash.onDidChange((evt: ISashEvent) => {
			let width = this._resizeOriginalWidth + evt.startX - evt.currentX;
			if (width < NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
				width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
			}

			const maxWidth = this._getMaxWidth();
			if (width > maxWidth) {
				width = maxWidth;
			}

			this._domNode.style.width = `${width}px`;

			if (this._isReplaceVisible) {
				this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
			}

			this._findInput.inputBox.layout();
		}));

		this._register(this._resizeSash.onDidReset(() => {
			// users double click on the sash
			// try to emulate what happens with editor findWidget
			const currentWidth = this._getDomWidth();
			let width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;

			if (currentWidth <= NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
				width = this._getMaxWidth();
			}

			this._domNode.style.width = `${width}px`;
			if (this._isReplaceVisible) {
				this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
			}

			this._findInput.inputBox.layout();
		}));
	}

	private _getMaxWidth() {
		return this._notebookEditor.getLayoutInfo().width - 64;
	}

	private _getDomWidth() {
		return dom.getTotalWidth(this._domNode) - (NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING * 2);
	}

	getCellToolbarActions(menu: IMenu): { primary: IAction[]; secondary: IAction[] } {
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		createAndFillInActionBarActions(menu, { shouldForwardArgs: true }, result, g => /^inline/.test(g));

		return result;
	}

	protected abstract onInputChanged(): boolean;
	protected abstract find(previous: boolean): void;
	protected abstract findFirst(): void;
	protected abstract replaceOne(): void;
	protected abstract replaceAll(): void;
	protected abstract onFocusTrackerFocus(): void;
	protected abstract onFocusTrackerBlur(): void;
	protected abstract onFindInputFocusTrackerFocus(): void;
	protected abstract onFindInputFocusTrackerBlur(): void;
	protected abstract onReplaceInputFocusTrackerFocus(): void;
	protected abstract onReplaceInputFocusTrackerBlur(): void;

	protected get inputValue() {
		return this._findInput.getValue();
	}

	protected get replaceValue() {
		return this._replaceInput.getValue();
	}

	protected get replacePattern() {
		if (this._state.isRegex) {
			return parseReplaceString(this.replaceValue);
		}
		return ReplacePattern.fromStaticValue(this.replaceValue);
	}

	public get focusTracker(): dom.IFocusTracker {
		return this._focusTracker;
	}

	public updateTheme(theme: IColorTheme): void {
		const inputStyles: IFindInputStyles = {
			inputActiveOptionBorder: theme.getColor(inputActiveOptionBorder),
			inputActiveOptionForeground: theme.getColor(inputActiveOptionForeground),
			inputActiveOptionBackground: theme.getColor(inputActiveOptionBackground),
			inputBackground: theme.getColor(inputBackground),
			inputForeground: theme.getColor(inputForeground),
			inputBorder: theme.getColor(inputBorder),
			inputValidationInfoBackground: theme.getColor(inputValidationInfoBackground),
			inputValidationInfoForeground: theme.getColor(inputValidationInfoForeground),
			inputValidationInfoBorder: theme.getColor(inputValidationInfoBorder),
			inputValidationWarningBackground: theme.getColor(inputValidationWarningBackground),
			inputValidationWarningForeground: theme.getColor(inputValidationWarningForeground),
			inputValidationWarningBorder: theme.getColor(inputValidationWarningBorder),
			inputValidationErrorBackground: theme.getColor(inputValidationErrorBackground),
			inputValidationErrorForeground: theme.getColor(inputValidationErrorForeground),
			inputValidationErrorBorder: theme.getColor(inputValidationErrorBorder),
		};
		this._findInput.style(inputStyles);
		const replaceStyles: IReplaceInputStyles = {
			inputActiveOptionBorder: theme.getColor(inputActiveOptionBorder),
			inputActiveOptionForeground: theme.getColor(inputActiveOptionForeground),
			inputActiveOptionBackground: theme.getColor(inputActiveOptionBackground),
			inputBackground: theme.getColor(inputBackground),
			inputForeground: theme.getColor(inputForeground),
			inputBorder: theme.getColor(inputBorder),
			inputValidationInfoBackground: theme.getColor(inputValidationInfoBackground),
			inputValidationInfoForeground: theme.getColor(inputValidationInfoForeground),
			inputValidationInfoBorder: theme.getColor(inputValidationInfoBorder),
			inputValidationWarningBackground: theme.getColor(inputValidationWarningBackground),
			inputValidationWarningForeground: theme.getColor(inputValidationWarningForeground),
			inputValidationWarningBorder: theme.getColor(inputValidationWarningBorder),
			inputValidationErrorBackground: theme.getColor(inputValidationErrorBackground),
			inputValidationErrorForeground: theme.getColor(inputValidationErrorForeground),
			inputValidationErrorBorder: theme.getColor(inputValidationErrorBorder),
		};
		this._replaceInput.style(replaceStyles);
	}

	private _onStateChanged(e: FindReplaceStateChangedEvent): void {
		this._updateButtons();
		this._updateMatchesCount();
	}

	private _updateButtons(): void {
		this._findInput.setEnabled(this._isVisible);
		this._replaceInput.setEnabled(this._isVisible && this._isReplaceVisible);
		const findInputIsNonEmpty = (this._state.searchString.length > 0);
		this._replaceBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
		this._replaceAllBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);

		this._domNode.classList.toggle('replaceToggled', this._isReplaceVisible);
		this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);

		this.foundMatch = this._state.matchesCount > 0;
		this.updateButtons(this.foundMatch);
	}

	protected _updateMatchesCount(): void {
	}

	override dispose() {
		super.dispose();

		if (this._domNode && this._domNode.parentElement) {
			this._domNode.parentElement.removeChild(this._domNode);
		}
	}

	public getDomNode() {
		return this._domNode;
	}

	public reveal(initialInput?: string): void {
		if (initialInput) {
			this._findInput.setValue(initialInput);
		}

		if (this._isVisible) {
			this._findInput.select();
			return;
		}

		this._isVisible = true;
		this.updateButtons(this.foundMatch);

		setTimeout(() => {
			this._domNode.classList.add('visible', 'visible-transition');
			this._domNode.setAttribute('aria-hidden', 'false');
			this._findInput.select();
		}, 0);
	}

	public focus(): void {
		this._findInput.focus();
	}

	public show(initialInput?: string, options?: { focus?: boolean }): void {
		if (initialInput) {
			this._findInput.setValue(initialInput);
		}

		this._isVisible = true;

		setTimeout(() => {
			this._domNode.classList.add('visible', 'visible-transition');
			this._domNode.setAttribute('aria-hidden', 'false');

			if (options?.focus ?? true) {
				this.focus();
			}
		}, 0);
	}

	public showWithReplace(initialInput?: string, replaceInput?: string): void {
		if (initialInput) {
			this._findInput.setValue(initialInput);
		}

		if (replaceInput) {
			this._replaceInput.setValue(replaceInput);
		}

		this._isVisible = true;
		this._isReplaceVisible = true;
		this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
		if (this._isReplaceVisible) {
			this._innerReplaceDomNode.style.display = 'flex';
		} else {
			this._innerReplaceDomNode.style.display = 'none';
		}

		setTimeout(() => {
			this._domNode.classList.add('visible', 'visible-transition');
			this._domNode.setAttribute('aria-hidden', 'false');
			this._updateButtons();

			this._replaceInput.focus();
		}, 0);
	}

	public hide(): void {
		if (this._isVisible) {
			this._domNode.classList.remove('visible-transition');
			this._domNode.setAttribute('aria-hidden', 'true');
			// Need to delay toggling visibility until after Transition, then visibility hidden - removes from tabIndex list
			setTimeout(() => {
				this._isVisible = false;
				this.updateButtons(this.foundMatch);
				this._domNode.classList.remove('visible');
			}, 200);
		}
	}

	protected _delayedUpdateHistory() {
		this._updateHistoryDelayer.trigger(this._updateHistory.bind(this));
	}

	protected _updateHistory() {
		this._findInput.inputBox.addToHistory();
	}

	protected _getRegexValue(): boolean {
		return this._findInput.getRegex();
	}

	protected _getWholeWordValue(): boolean {
		return this._findInput.getWholeWords();
	}

	protected _getCaseSensitiveValue(): boolean {
		return this._findInput.getCaseSensitive();
	}

	protected updateButtons(foundMatch: boolean) {
		const hasInput = this.inputValue.length > 0;
		this.prevBtn.setEnabled(this._isVisible && hasInput && foundMatch);
		this.nextBtn.setEnabled(this._isVisible && hasInput && foundMatch);
	}
}

// theming
registerThemingParticipant((theme, collector) => {
	const findWidgetBGColor = theme.getColor(editorWidgetBackground);
	if (findWidgetBGColor) {
		collector.addRule(`.monaco-workbench .simple-fr-find-part-wrapper { background-color: ${findWidgetBGColor} !important; }`);
	}

	const widgetForeground = theme.getColor(editorWidgetForeground);
	if (widgetForeground) {
		collector.addRule(`.monaco-workbench .simple-fr-find-part-wrapper { color: ${widgetForeground}; }`);
	}

	const widgetShadowColor = theme.getColor(widgetShadow);
	if (widgetShadowColor) {
		collector.addRule(`.monaco-workbench .simple-fr-find-part-wrapper { box-shadow: 0 0 8px 2px ${widgetShadowColor}; }`);
	}

	const inputActiveOptionBorderColor = theme.getColor(inputActiveOptionBorder);
	if (inputActiveOptionBorderColor) {
		collector.addRule(`.simple-fr-find-part .find-filter-button > .monaco-action-bar .action-label.notebook-filters.checked { border-color: ${inputActiveOptionBorderColor}; }`);
	}
	const inputActiveOptionForegroundColor = theme.getColor(inputActiveOptionForeground);
	if (inputActiveOptionForegroundColor) {
		collector.addRule(`.simple-fr-find-part .find-filter-button > .monaco-action-bar .action-label.notebook-filters.checked { color: ${inputActiveOptionForegroundColor}; }`);
	}
	const inputActiveOptionBackgroundColor = theme.getColor(inputActiveOptionBackground);
	if (inputActiveOptionBackgroundColor) {
		collector.addRule(`.simple-fr-find-part .find-filter-button > .monaco-action-bar .action-label.notebook-filters.checked { background-color: ${inputActiveOptionBackgroundColor}; }`);
	}

	const resizeBorderBackground = theme.getColor(editorWidgetResizeBorder) ?? theme.getColor(editorWidgetBorder);
	if (resizeBorderBackground) {
		collector.addRule(`.monaco-workbench .simple-fr-find-part-wrapper .monaco-sash { background-color: ${resizeBorderBackground}; }`);
	}

	collector.addRule(`
	:root {
		--notebook-find-width: ${NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH}px;
		--notebook-find-horizontal-padding: ${NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING}px;
	}
	`);
});
