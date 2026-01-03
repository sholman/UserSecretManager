using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using UserSecretManager.Models;
using UserSecretManager.Services;

namespace UserSecretManager.ViewModels;

/// <summary>
/// ViewModel for a single project tab containing secrets.
/// </summary>
public partial class ProjectTabViewModel : ViewModelBase
{
    private readonly ProjectSecrets _secrets;
    private readonly ISecretsService _secretsService;

    [ObservableProperty]
    private string _content;

    [ObservableProperty]
    private bool _isDirty;

    [ObservableProperty]
    private bool _isValidJson = true;

    [ObservableProperty]
    private string? _validationError;

    [ObservableProperty]
    private bool _isSearchMatch = true;

    public string ProjectName => _secrets.Project.Name;
    public string UserSecretsId => _secrets.Project.UserSecretsId;
    public string ProjectPath => _secrets.Project.ProjectPath;
    public string SecretsFilePath => _secrets.Project.SecretsFilePath;
    public bool SecretsFileExists => _secrets.Project.SecretsFileExists;
    public DateTime? LastModified => _secrets.LastModified;

    public string TabHeader => IsDirty ? $"{ProjectName} *" : ProjectName;

    public ProjectTabViewModel(ProjectSecrets secrets, ISecretsService secretsService)
    {
        _secrets = secrets;
        _secretsService = secretsService;
        _content = secrets.Content;
        _isValidJson = secrets.IsValidJson;
        _validationError = secrets.ValidationError;
    }

    partial void OnContentChanged(string value)
    {
        var (isValid, error) = _secretsService.ValidateJson(value);
        IsValidJson = isValid;
        ValidationError = error;
        
        IsDirty = value != _secrets.Content;
        _secrets.Content = value;
        _secrets.IsValidJson = isValid;
        _secrets.ValidationError = error;
        
        OnPropertyChanged(nameof(TabHeader));
    }

    partial void OnIsDirtyChanged(bool value)
    {
        OnPropertyChanged(nameof(TabHeader));
    }

    [RelayCommand]
    public async Task SaveAsync()
    {
        if (!IsValidJson)
        {
            throw new InvalidOperationException($"Cannot save invalid JSON: {ValidationError}");
        }

        _secrets.Content = Content;
        await _secretsService.SaveSecretsAsync(_secrets);
        IsDirty = false;
    }

    [RelayCommand]
    private void FormatJson()
    {
        if (!IsValidJson) return;
        
        Content = _secretsService.FormatJson(Content);
    }

    [RelayCommand]
    private void CopyToClipboard()
    {
        // This will be implemented with platform clipboard access
    }
}
