using System.Collections.ObjectModel;
using Avalonia.Platform.Storage;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using UserSecretManager.Models;
using UserSecretManager.Services;

namespace UserSecretManager.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private readonly IProjectScanner _projectScanner;
    private readonly ISecretsService _secretsService;
    private Func<Task<IStorageFolder?>>? _folderPickerFunc;

    [ObservableProperty]
    private bool _isScanning;

    [ObservableProperty]
    private string? _currentDirectory;

    [ObservableProperty]
    private string? _statusMessage;

    [ObservableProperty]
    private ProjectListItemViewModel? _selectedProject;

    [ObservableProperty]
    private ProjectTabViewModel? _selectedSecrets;

    [ObservableProperty]
    private string _searchText = string.Empty;

    public ObservableCollection<ProjectListItemViewModel> Projects { get; } = [];

    public MainWindowViewModel()
        : this(new ProjectScanner(), new SecretsService())
    {
    }

    public MainWindowViewModel(IProjectScanner projectScanner, ISecretsService secretsService)
    {
        _projectScanner = projectScanner;
        _secretsService = secretsService;
        StatusMessage = "Select a folder to scan for .NET projects with User Secrets";
    }

    public void SetFolderPicker(Func<Task<IStorageFolder?>> folderPickerFunc)
    {
        _folderPickerFunc = folderPickerFunc;
    }

    [RelayCommand]
    private async Task OpenFolderAsync()
    {
        if (_folderPickerFunc is null)
        {
            StatusMessage = "Folder picker not available";
            return;
        }

        var folder = await _folderPickerFunc();
        if (folder is null) return;

        await ScanDirectoryAsync(folder.Path.LocalPath);
    }

    [RelayCommand]
    private async Task ScanDirectoryAsync(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return;

        IsScanning = true;
        StatusMessage = $"Scanning {path}...";
        Projects.Clear();
        SelectedProject = null;
        SelectedSecrets = null;

        try
        {
            var projects = await _projectScanner.ScanDirectoryAsync(path);
            CurrentDirectory = path;

            if (projects.Count == 0)
            {
                StatusMessage = "No projects with User Secrets found";
                return;
            }

            foreach (var project in projects)
            {
                Projects.Add(new ProjectListItemViewModel(project));
            }

            StatusMessage = $"Found {projects.Count} project(s) with User Secrets";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error scanning: {ex.Message}";
        }
        finally
        {
            IsScanning = false;
        }
    }

    async partial void OnSelectedProjectChanged(ProjectListItemViewModel? value)
    {
        if (value is null)
        {
            SelectedSecrets = null;
            return;
        }

        try
        {
            var secrets = await _secretsService.LoadSecretsAsync(value.Project);
            var viewModel = new ProjectTabViewModel(secrets, _secretsService);
            await viewModel.LoadAppSettingsAsync();
            SelectedSecrets = viewModel;
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error loading secrets: {ex.Message}";
        }
    }

    [RelayCommand]
    private async Task SaveCurrentAsync()
    {
        if (SelectedSecrets is null) return;

        try
        {
            await SelectedSecrets.SaveAsync();
            StatusMessage = $"Saved {SelectedSecrets.ProjectName}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"Error saving: {ex.Message}";
        }
    }

    [RelayCommand]
    private async Task SaveAllAsync()
    {
        // With the new model, we only have one loaded at a time
        // This could be enhanced later to track all modified secrets
        if (SelectedSecrets?.IsDirty == true)
        {
            await SaveCurrentAsync();
        }
        else
        {
            StatusMessage = "No changes to save";
        }
    }

    partial void OnSearchTextChanged(string value)
    {
        // Filter projects by name or search in secrets content
        foreach (var project in Projects)
        {
            project.IsVisible = string.IsNullOrWhiteSpace(value) ||
                                project.Name.Contains(value, StringComparison.OrdinalIgnoreCase);
        }
    }
}
