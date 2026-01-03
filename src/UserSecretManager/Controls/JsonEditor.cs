using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Media;
using AvaloniaEdit;
using AvaloniaEdit.TextMate;
using TextMateSharp.Grammars;

namespace UserSecretManager.Controls;

public partial class JsonEditor : UserControl
{
    private TextEditor _editor = null!;
    private bool _isUpdating;
    private TextMate.Installation? _textMate;

    public static readonly StyledProperty<string?> TextProperty =
        AvaloniaProperty.Register<JsonEditor, string?>(nameof(Text), 
            defaultBindingMode: Avalonia.Data.BindingMode.TwoWay,
            coerce: (o, v) => v ?? string.Empty);

    public static readonly StyledProperty<bool> IsReadOnlyProperty =
        AvaloniaProperty.Register<JsonEditor, bool>(nameof(IsReadOnly));

    public string? Text
    {
        get => GetValue(TextProperty);
        set => SetValue(TextProperty, value);
    }

    public bool IsReadOnly
    {
        get => GetValue(IsReadOnlyProperty);
        set => SetValue(IsReadOnlyProperty, value);
    }

    public JsonEditor()
    {
        InitializeComponent();
        
        _editor = this.FindControl<TextEditor>("Editor")!;
        
        if (_editor != null)
        {
            // Apply initial values
            _editor.IsReadOnly = IsReadOnly;
            
            // Set up TextMate syntax highlighting
            try
            {
                var registryOptions = new RegistryOptions(ThemeName.DarkPlus);
                _textMate = _editor.InstallTextMate(registryOptions);
                _textMate.SetGrammar("source.json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"TextMate setup failed: {ex.Message}");
            }
            
            // Handle editor text changes
            _editor.TextChanged += (s, e) =>
            {
                if (_isUpdating) return;
                _isUpdating = true;
                Text = _editor.Text;
                _isUpdating = false;
            };
        }
        else
        {
            Console.WriteLine("ERROR: Editor not found in JsonEditor control!");
        }
    }

    protected override void OnLoaded(Avalonia.Interactivity.RoutedEventArgs e)
    {
        base.OnLoaded(e);
        
        // Sync text when loaded
        if (_editor != null && !string.IsNullOrEmpty(Text) && _editor.Text != Text)
        {
            Console.WriteLine($"OnLoaded: Setting editor text, length={Text.Length}");
            _isUpdating = true;
            _editor.Text = Text;
            _isUpdating = false;
        }
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (_editor == null) return;

        if (change.Property == TextProperty && !_isUpdating)
        {
            var newText = change.GetNewValue<string?>() ?? string.Empty;
            Console.WriteLine($"TextProperty changed: length={newText.Length}");
            if (_editor.Text != newText)
            {
                _isUpdating = true;
                _editor.Text = newText;
                _isUpdating = false;
                Console.WriteLine("Editor text updated");
            }
        }
        else if (change.Property == IsReadOnlyProperty)
        {
            _editor.IsReadOnly = change.GetNewValue<bool>();
        }
    }
}
